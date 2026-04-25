/**
 * SwapV2 链上 reserve 价格源实现
 *
 * 说明：
 * - 复用现有 swapV2 合约 getter
 * - 只读取 factory/pair/reserves，不引入新的报价协议
 */

import { Contract, formatUnits } from "ethers";
import { DataSourceBase } from "../base.mjs";
import { resolveEvmNetProvider } from "../../../evm/netprovider.mjs";
import { loadContractArtifact } from "../../../evm/contracts/load.mjs";
import { resolveEvmToken } from "../../../evm/configs/tokens.js";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function isAddressLike(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(normalizeString(value));
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeNetworkName(network) {
  const raw = normalizeLower(network);
  if (!raw) return null;
  if (raw === "ethereum") return "eth";
  if (raw === "binance-smart-chain") return "bsc";
  return raw;
}

function getSwapDefaults(network) {
  const net = normalizeNetworkName(network);
  if (net === "eth") {
    return {
      factoryAddress: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
      quoteTokenKey: "usdt",
    };
  }
  if (net === "bsc") {
    return {
      factoryAddress: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quoteTokenKey: "usdt",
    };
  }
  return null;
}

function getTokenDecimals(tokenAddress, tokenMetas) {
  const key = normalizeLower(tokenAddress);
  const meta = tokenMetas instanceof Map ? tokenMetas.get(key) : tokenMetas?.[key];
  const decimals = Number(meta?.decimals);
  return Number.isFinite(decimals) && decimals >= 0 ? decimals : null;
}

async function buildContract(contractName, address, runner) {
  const artifact = await loadContractArtifact({ contractName });
  return new Contract(address, artifact.artifact.abi, runner);
}

function calcPriceUsdFromReserves(pair, queryToken, quoteTokenAddress, quoteTokenDecimals, tokenMetas) {
  if (!pair) return null;

  const tokenAddress = normalizeLower(queryToken);
  const pairToken0 = normalizeLower(pair?.token0Address ?? pair?.token0 ?? null);
  const pairToken1 = normalizeLower(pair?.token1Address ?? pair?.token1 ?? null);
  const reserve0 = pair?.reserve0 ?? null;
  const reserve1 = pair?.reserve1 ?? null;

  if (!isAddressLike(tokenAddress) || !isAddressLike(quoteTokenAddress)) return null;
  if (!isAddressLike(pairToken0) || !isAddressLike(pairToken1)) return null;
  if (reserve0 == null || reserve1 == null) return null;

  const tokenDecimals = getTokenDecimals(tokenAddress, tokenMetas) ?? 18;
  const quoteDecimals = Number.isFinite(Number(quoteTokenDecimals)) ? Number(quoteTokenDecimals) : 18;

  const token0 = normalizeLower(pairToken0);
  const token1 = normalizeLower(pairToken1);
  const normalizedTokenReserve = tokenAddress === token0 ? formatUnits(reserve0, tokenDecimals) : formatUnits(reserve1, tokenDecimals);
  const normalizedQuoteReserve = tokenAddress === token0 ? formatUnits(reserve1, quoteDecimals) : formatUnits(reserve0, quoteDecimals);

  const tokenReserve = Number(normalizedTokenReserve);
  const quoteReserve = Number(normalizedQuoteReserve);
  if (!Number.isFinite(tokenReserve) || !Number.isFinite(quoteReserve) || tokenReserve <= 0 || quoteReserve <= 0) {
    return null;
  }

  return quoteReserve / tokenReserve;
}

export class SwapV2Source extends DataSourceBase {
  metadata = {
    name: "swapv2",
    version: "1.0.0",
    description: "On-chain V2 reserve pricing using existing swapV2 getters",
    capabilities: ["getPrice"],
    rateLimit: { requests: 10, period: 60000 },
    cacheTTL: 10000,
  };

  constructor(options = {}) {
    super(options);
    this.timeout = options.timeout ?? 10000;
    this.factoryGetter = options.factoryGetter ?? (async (address, getterOptions = {}) => {
      const runner = getterOptions.provider ?? getterOptions.runner ?? null;
      return buildContract("ISwapV2Factory", address, runner);
    });
    this.pairGetter = options.pairGetter ?? (async (address, getterOptions = {}) => {
      const runner = getterOptions.provider ?? getterOptions.runner ?? null;
      return buildContract("ISwapV2Pair", address, runner);
    });
  }

  async init(config = {}) {
    this.timeout = config.timeout ?? this.timeout;
    this.factoryGetter = config.factoryGetter ?? this.factoryGetter;
    this.pairGetter = config.pairGetter ?? this.pairGetter;
    this.state = DataSourceBase.State.HEALTHY;
  }

  async getPrice(tokens, optionsOrVsCurrency = "usd") {
    const options = typeof optionsOrVsCurrency === "string"
      ? { vsCurrency: optionsOrVsCurrency }
      : (optionsOrVsCurrency ?? {});
    const vsCurrency = normalizeLower(options.vsCurrency ?? "usd") || "usd";
    const network = normalizeNetworkName(options.network);
    const defaults = getSwapDefaults(network);
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    const out = {};

    if (vsCurrency !== "usd" || !network || !defaults) {
      return out;
    }

    const provider = options.provider
      ?? options.netProvider?.provider
      ?? resolveEvmNetProvider({ networkName: network }, options).provider;
    if (!provider) return out;

    let factory;
    try {
      factory = await this.factoryGetter(defaults.factoryAddress, { provider });
    } catch {
      return out;
    }

    const quoteToken = resolveEvmToken({ network, key: defaults.quoteTokenKey });
    const quoteTokenAddress = normalizeLower(quoteToken?.address);
    const quoteTokenDecimals = Number(quoteToken?.decimals ?? 18);
    if (!quoteTokenAddress) return out;

    for (const token of tokenList) {
      const tokenAddress = normalizeLower(token);
      if (!isAddressLike(tokenAddress)) continue;

      let pairAddress;
      try {
        pairAddress = normalizeLower(await factory.getPair(tokenAddress, quoteTokenAddress));
      } catch {
        continue;
      }

      if (!pairAddress || /^0x0{40}$/.test(pairAddress)) continue;

      let pair;
      try {
        pair = await this.pairGetter(pairAddress, { provider });
      } catch {
        continue;
      }

      try {
        const [reserve0, reserve1] = await pair.getReserves();
        const token0 = normalizeLower(await pair.token0());
        const token1 = normalizeLower(await pair.token1());
        const priceUsd = calcPriceUsdFromReserves({
          reserve0,
          reserve1,
          token0Address: token0,
          token1Address: token1,
        }, tokenAddress, quoteTokenAddress, quoteTokenDecimals, options.tokenMetas);

        if (!Number.isFinite(priceUsd)) continue;

        out[tokenAddress] = {
          usd: priceUsd,
          source: "swapv2",
          network,
          chainId: network === "bsc" ? 56 : 1,
          factoryAddress: defaults.factoryAddress,
          pairAddress,
          quoteTokenAddress,
          quoteTokenSymbol: quoteToken?.symbol ?? "USDT",
        };
      } catch {
        continue;
      }
    }

    return out;
  }
}

export default SwapV2Source;