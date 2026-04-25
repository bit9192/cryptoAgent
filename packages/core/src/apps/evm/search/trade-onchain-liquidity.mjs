import { getAddress } from "ethers";
import { EvmContract, getContract } from "../contracts/deploy.mjs";
import { resolveEvmContract } from "../configs/contracts.js";
import { resolveEvmToken } from "../configs/tokens.js";
import { multiCall } from "../multicall.mjs";

const SWAP_V2_FACTORY_ABI = [
  "function getPair(address,address) view returns (address)",
];

const SWAP_V2_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

const ERC20_DECIMALS_ABI = [
  "function decimals() view returns (uint8)",
];

const STABLE_QUOTE_SYMBOLS = new Set(["USDT", "USDC", "BUSD", "DAI"]);
const WRAPPED_NATIVE_SYMBOLS = new Set(["WBNB", "WETH"]);

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

function mapNetworkToChainId(network) {
  const raw = normalizeLower(network);
  if (raw === "bsc") return "bsc";
  if (["eth", "ethereum", "mainnet"].includes(raw)) return "ethereum";
  return raw || null;
}

function resolveMulticallClient(network, options = {}) {
  if (options.multicall && typeof options.multicall.call === "function") {
    return options.multicall;
  }

  const explicitAddress = getAddress(resolveEvmContract({
    key: "multicall3",
    network,
    chainId: options.chainId,
    forkSourceChainId: options.forkSourceChainId,
    overrides: options.contractOverrides,
  }));

  const config = {
    getContract: typeof options.getContract === "function"
      ? options.getContract
      : async (_config, resolveArgs = {}) => await getContract("Multicall3", explicitAddress, resolveArgs),
  };
  return multiCall(config);
}

function normalizeQuoteSymbols(dexConfigs = []) {
  const set = new Set();
  for (const cfg of Array.isArray(dexConfigs) ? dexConfigs : []) {
    for (const quote of Array.isArray(cfg?.quotes) ? cfg.quotes : []) {
      const symbol = String(quote ?? "").trim().toLowerCase();
      if (symbol) set.add(symbol);
    }
  }
  if (set.size === 0) {
    set.add("usdt");
    set.add("usdc");
    if ((Array.isArray(dexConfigs) ? dexConfigs : []).some((cfg) => normalizeLower(cfg?.id).includes("bsc"))) {
      set.add("wbnb");
    } else {
      set.add("weth");
    }
  }
  return [...set];
}

function normalizeDecimals(value, fallback = 18) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 36 ? n : fallback;
}

function toBigIntSafe(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && String(value).trim() !== "") {
    try {
      return BigInt(String(value).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeReserveTuple(value) {
  if (Array.isArray(value) && value.length >= 2) {
    return {
      reserve0: toBigIntSafe(value[0]),
      reserve1: toBigIntSafe(value[1]),
    };
  }
  if (value && typeof value === "object") {
    return {
      reserve0: toBigIntSafe(value.reserve0),
      reserve1: toBigIntSafe(value.reserve1),
    };
  }
  return {
    reserve0: null,
    reserve1: null,
  };
}

function bigintToUnitNumber(value, decimals = 18) {
  const raw = toBigIntSafe(value);
  if (raw == null) return null;
  const unit = 10 ** normalizeDecimals(decimals, 18);
  const num = Number(raw) / unit;
  return Number.isFinite(num) ? num : null;
}

function estimatePairUsdMetrics(input = {}) {
  const tokenAddress = normalizeLower(input.tokenAddress);
  const quoteAddress = normalizeLower(input.quoteToken?.address);
  const quoteSymbol = String(input.quoteToken?.symbol ?? "").trim().toUpperCase();
  const quoteDecimals = normalizeDecimals(input.quoteDecimals ?? input.quoteToken?.decimals, 18);
  const baseDecimals = normalizeDecimals(input.baseDecimals, 18);
  const token0 = normalizeLower(input.token0);
  const token1 = normalizeLower(input.token1);
  const reserve0 = toBigIntSafe(input.reserve0);
  const reserve1 = toBigIntSafe(input.reserve1);

  if (!tokenAddress || !quoteAddress || !token0 || !token1 || reserve0 == null || reserve1 == null) {
    return {
      priceUsd: null,
      liquidityUsd: null,
    };
  }

  const quoteIsToken0 = token0 === quoteAddress;
  const quoteIsToken1 = token1 === quoteAddress;
  const baseIsToken0 = token0 === tokenAddress;
  const baseIsToken1 = token1 === tokenAddress;

  let quoteReserveRaw = null;
  if (quoteIsToken0) quoteReserveRaw = reserve0;
  if (quoteIsToken1) quoteReserveRaw = reserve1;

  let baseReserveRaw = null;
  if (baseIsToken0) baseReserveRaw = reserve0;
  if (baseIsToken1) baseReserveRaw = reserve1;

  const quoteReserve = bigintToUnitNumber(quoteReserveRaw, quoteDecimals);
  const baseReserve = bigintToUnitNumber(baseReserveRaw, baseDecimals);
  const stableQuote = STABLE_QUOTE_SYMBOLS.has(quoteSymbol);
  const quoteUsdFromAnchor = Number(input.quoteUsd);
  const quoteUsd = stableQuote
    ? 1
    : (Number.isFinite(quoteUsdFromAnchor) && quoteUsdFromAnchor > 0 ? quoteUsdFromAnchor : null);

  const liquidityUsd = quoteReserve != null && quoteUsd != null
    ? quoteReserve * quoteUsd * 2
    : null;

  const priceUsd = quoteReserve != null
    && baseReserve != null
    && baseReserve > 0
    && quoteUsd != null
    ? (quoteReserve / baseReserve) * quoteUsd
    : null;

  return {
    priceUsd,
    liquidityUsd,
  };
}

function buildAnchorUsdMap({
  anchorDetails = [],
  tokenDecimalsMap = new Map(),
} = {}) {
  const anchorUsdMap = new Map();
  const rankMap = new Map();

  for (const row of Array.isArray(anchorDetails) ? anchorDetails : []) {
    const anchorSymbol = String(row?.anchorSymbol ?? "").trim().toUpperCase();
    const anchorAddress = normalizeLower(row?.anchorAddress);
    const stableAddress = normalizeLower(row?.stableAddress);
    if (!anchorSymbol || !anchorAddress || !stableAddress) continue;

    const reserves = normalizeReserveTuple(row?.reserves);
    const token0 = normalizeLower(row?.token0);
    const token1 = normalizeLower(row?.token1);
    if (!token0 || !token1 || reserves.reserve0 == null || reserves.reserve1 == null) continue;

    const token0Decimals = tokenDecimalsMap.get(token0) ?? 18;
    const token1Decimals = tokenDecimalsMap.get(token1) ?? 18;
    const reserve0 = bigintToUnitNumber(reserves.reserve0, token0Decimals);
    const reserve1 = bigintToUnitNumber(reserves.reserve1, token1Decimals);
    if (reserve0 == null || reserve1 == null) continue;

    let anchorReserve = null;
    let stableReserve = null;
    if (token0 === anchorAddress && token1 === stableAddress) {
      anchorReserve = reserve0;
      stableReserve = reserve1;
    } else if (token1 === anchorAddress && token0 === stableAddress) {
      anchorReserve = reserve1;
      stableReserve = reserve0;
    } else {
      continue;
    }
    if (!(anchorReserve > 0) || !(stableReserve > 0)) continue;

    const anchorUsd = stableReserve / anchorReserve;
    const liquidityUsd = stableReserve * 2;
    const rank = rankMap.get(anchorSymbol) ?? -1;
    if (liquidityUsd > rank) {
      rankMap.set(anchorSymbol, liquidityUsd);
      anchorUsdMap.set(anchorSymbol, anchorUsd);
    }
  }

  return anchorUsdMap;
}

export async function searchOnchainLiquidityPairs(input = {}, options = {}) {
  const tokenAddress = String(input?.tokenAddress ?? "").trim();
  const network = String(input?.network ?? "").trim();
  const dexConfigs = Array.isArray(input?.dexConfigs)
    ? input.dexConfigs
    : (Array.isArray(options?.dexConfigs) ? options.dexConfigs : []);

  if (!isEvmAddress(tokenAddress) || !network || dexConfigs.length === 0) {
    return [];
  }

  const multicallClient = resolveMulticallClient(network, options);

  const quoteSymbols = normalizeQuoteSymbols(dexConfigs);
  const quoteTokens = [];
  for (const symbol of quoteSymbols) {
    try {
      const token = resolveEvmToken({ network, key: symbol });
      if (isEvmAddress(token?.address)) {
        quoteTokens.push({
          symbol: String(token.symbol ?? symbol).toUpperCase(),
          address: String(token.address).toLowerCase(),
          decimals: normalizeDecimals(token?.decimals, 18),
        });
      }
    } catch {
      // ignore missing quote token config
    }
  }
  if (quoteTokens.length === 0) return [];

  const out = [];
  const seen = new Set();

  for (const dex of dexConfigs) {
    const dexId = String(dex?.id ?? "").trim();
    const factoryAddress = String(dex?.factory ?? "").trim();
    if (!dexId || !isEvmAddress(factoryAddress)) continue;

    const factory = new EvmContract(factoryAddress, SWAP_V2_FACTORY_ABI, null);
    const requestShape = quoteTokens
      .filter((quote) => normalizeLower(quote.address) !== normalizeLower(tokenAddress))
      .map((quote) => ({
        quote,
        pairAddress: factory.calls.getPair(tokenAddress, quote.address),
      }));
    if (requestShape.length === 0) continue;

    let rows;
    try {
      rows = await multicallClient.call(requestShape, {
        ...options,
        networkName: network,
        network,
      });
    } catch {
      continue;
    }

    const candidates = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const quote = row?.quote ?? null;
      const pairAddress = String(row?.pairAddress ?? "").trim().toLowerCase();
      if (!isEvmAddress(pairAddress) || /^0x0{40}$/.test(pairAddress)) continue;
      candidates.push({ pairAddress, quote });
    }
    if (candidates.length === 0) continue;

    const pairMetaMap = new Map();
    const pairMetaRequestShape = candidates.map((candidate) => {
      const pair = new EvmContract(candidate.pairAddress, SWAP_V2_PAIR_ABI, null);
      return {
        candidate,
        token0: pair.calls.token0(),
        token1: pair.calls.token1(),
        reserves: pair.calls.getReserves(),
      };
    });

    try {
      const detailRows = await multicallClient.call(pairMetaRequestShape, {
        ...options,
        networkName: network,
        network,
      });
      for (const detail of Array.isArray(detailRows) ? detailRows : []) {
        const candidate = detail?.candidate ?? null;
        const pairAddress = String(candidate?.pairAddress ?? "").trim().toLowerCase();
        if (!isEvmAddress(pairAddress)) continue;
        const reserves = normalizeReserveTuple(detail?.reserves);
        pairMetaMap.set(pairAddress, {
          token0: detail?.token0 ?? null,
          token1: detail?.token1 ?? null,
          reserve0: reserves.reserve0,
          reserve1: reserves.reserve1,
        });
      }
    } catch {
      // reserve-level failure is downgraded; keep pair-level output
    }

    const stableQuoteTokens = quoteTokens.filter((quote) => STABLE_QUOTE_SYMBOLS.has(String(quote?.symbol ?? "").toUpperCase()));
    const neededAnchorSymbols = [...new Set(
      candidates
        .map((candidate) => String(candidate?.quote?.symbol ?? "").trim().toUpperCase())
        .filter((symbol) => WRAPPED_NATIVE_SYMBOLS.has(symbol)),
    )];

    const anchorPairCandidates = [];
    if (stableQuoteTokens.length > 0 && neededAnchorSymbols.length > 0) {
      const symbolToQuoteToken = new Map(quoteTokens.map((quote) => [String(quote?.symbol ?? "").toUpperCase(), quote]));
      const anchorPairReq = [];

      for (const anchorSymbol of neededAnchorSymbols) {
        const anchorToken = symbolToQuoteToken.get(anchorSymbol);
        if (!anchorToken || !isEvmAddress(anchorToken.address)) continue;

        for (const stableToken of stableQuoteTokens) {
          if (!isEvmAddress(stableToken?.address)) continue;
          anchorPairReq.push({
            anchorSymbol,
            anchorToken,
            stableToken,
            pairAddress: factory.calls.getPair(anchorToken.address, stableToken.address),
          });
        }
      }

      if (anchorPairReq.length > 0) {
        try {
          const anchorPairRows = await multicallClient.call(anchorPairReq, {
            ...options,
            networkName: network,
            network,
          });

          for (const row of Array.isArray(anchorPairRows) ? anchorPairRows : []) {
            const pairAddress = normalizeLower(row?.pairAddress);
            if (!isEvmAddress(pairAddress) || /^0x0{40}$/.test(pairAddress)) continue;
            anchorPairCandidates.push({
              anchorSymbol: String(row?.anchorSymbol ?? "").trim().toUpperCase(),
              anchorAddress: normalizeLower(row?.anchorToken?.address),
              stableAddress: normalizeLower(row?.stableToken?.address),
              anchorPairAddress: pairAddress,
            });
          }
        } catch {
          // anchor-pair lookup failure is downgraded
        }
      }
    }

    const anchorDetailMap = new Map();
    if (anchorPairCandidates.length > 0) {
      const anchorDetailsReq = anchorPairCandidates.map((candidate) => {
        const pair = new EvmContract(candidate.anchorPairAddress, SWAP_V2_PAIR_ABI, null);
        return {
          ...candidate,
          token0: pair.calls.token0(),
          token1: pair.calls.token1(),
          reserves: pair.calls.getReserves(),
        };
      });

      try {
        const anchorDetailRows = await multicallClient.call(anchorDetailsReq, {
          ...options,
          networkName: network,
          network,
        });
        for (const row of Array.isArray(anchorDetailRows) ? anchorDetailRows : []) {
          const pairAddress = normalizeLower(row?.anchorPairAddress);
          if (!isEvmAddress(pairAddress)) continue;
          anchorDetailMap.set(pairAddress, row);
        }
      } catch {
        // anchor reserve lookup failure is downgraded
      }
    }

    const tokenDecimalsMap = new Map();
    const decimalsCache = options.decimalsCache instanceof Map ? options.decimalsCache : null;

    const tokenAddressList = [...new Set(
      [
        ...[...pairMetaMap.values()].flatMap((detail) => [detail?.token0, detail?.token1]),
        ...[...anchorDetailMap.values()].flatMap((detail) => [detail?.token0, detail?.token1]),
      ]
        .map((value) => normalizeLower(value))
        .filter((value) => isEvmAddress(value)),
    )];

    // Pre-fill from cache
    for (const addr of tokenAddressList) {
      if (decimalsCache && decimalsCache.has(addr)) {
        tokenDecimalsMap.set(addr, decimalsCache.get(addr));
      }
    }

    const uncachedAddresses = tokenAddressList.filter((addr) => !tokenDecimalsMap.has(addr));

    if (uncachedAddresses.length > 0) {
      const decimalsRequestShape = uncachedAddresses.map((address) => {
        const token = new EvmContract(address, ERC20_DECIMALS_ABI, null);
        return {
          tokenAddress: address,
          decimals: token.calls.decimals(),
        };
      });

      try {
        const decimalsRows = await multicallClient.call(decimalsRequestShape, {
          ...options,
          networkName: network,
          network,
        });
        for (const row of Array.isArray(decimalsRows) ? decimalsRows : []) {
          const tokenAddr = normalizeLower(row?.tokenAddress);
          if (!isEvmAddress(tokenAddr)) continue;
          const dec = normalizeDecimals(row?.decimals, 18);
          tokenDecimalsMap.set(tokenAddr, dec);
          if (decimalsCache) decimalsCache.set(tokenAddr, dec);
        }
      } catch {
        // decimals-level failure is downgraded; keep fallback decimals path
      }
    }

    const anchorUsdMap = buildAnchorUsdMap({
      anchorDetails: [...anchorDetailMap.values()],
      tokenDecimalsMap,
    });

    // ETS-T10: fill missing anchor USD from external resolver for WBNB/WETH quotes
    const anchorPriceResolver = typeof options.anchorPriceResolver === "function"
      ? options.anchorPriceResolver
      : null;
    if (anchorPriceResolver && neededAnchorSymbols.length > 0) {
      for (const symbol of neededAnchorSymbols) {
        if (!anchorUsdMap.has(symbol)) {
          try {
            const resolvedUsd = await anchorPriceResolver(symbol);
            const usd = Number(resolvedUsd);
            if (Number.isFinite(usd) && usd > 0) {
              anchorUsdMap.set(symbol, usd);
            }
          } catch {
            // resolver failure is downgraded; symbol stays missing from map
          }
        }
      }
    }

    for (const candidate of candidates) {
      const pairAddress = String(candidate?.pairAddress ?? "").trim().toLowerCase();
      const quote = candidate?.quote ?? null;
      if (!isEvmAddress(pairAddress)) continue;
      if (seen.has(pairAddress)) continue;

      const detail = pairMetaMap.get(pairAddress) ?? null;
      const metrics = estimatePairUsdMetrics({
        tokenAddress,
        quoteToken: quote,
        quoteUsd: anchorUsdMap.get(String(quote?.symbol ?? "").toUpperCase()) ?? null,
        quoteDecimals: tokenDecimalsMap.get(normalizeLower(quote?.address)) ?? normalizeDecimals(quote?.decimals, 18),
        baseDecimals: tokenDecimalsMap.get(normalizeLower(tokenAddress)) ?? 18,
        token0: detail?.token0,
        token1: detail?.token1,
        reserve0: detail?.reserve0,
        reserve1: detail?.reserve1,
      });

      seen.add(pairAddress);
      out.push({
        chainId: mapNetworkToChainId(network),
        dexId,
        pairAddress,
        priceUsd: metrics.priceUsd,
        liquidity: { usd: metrics.liquidityUsd },
        volume: { h24: null },
        baseToken: {
          address: tokenAddress,
          symbol: null,
        },
        quoteToken: {
          address: quote?.address ?? null,
          symbol: quote?.symbol ?? null,
        },
      });
    }
  }

  return out;
}

export default {
  searchOnchainLiquidityPairs,
};
