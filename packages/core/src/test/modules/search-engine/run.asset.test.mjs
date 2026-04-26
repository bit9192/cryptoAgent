/**
 * run.asset.mjs — 地址批量资产查询专用脚本
 *
 * 用法：
 *   node src/test/modules/search-engine/run.asset.test.mjs
 *   node src/test/modules/search-engine/run.asset.test.mjs --debug
 */

import { readFileSync } from "node:fs";
import { searchAddressAssetsTask } from "../../../tasks/search/index.mjs";
import { searchAddressValuationTask } from "../../../tasks/search/index.mjs";
import { searchAddressCheckTask } from "../../../tasks/search/index.mjs";
import { resolveTrxNetProvider } from "../../../apps/trx/netprovider.mjs";
import { toTrxHexAddress } from "../../../apps/trx/address-codec.mjs";
import { getTrxTokenBook } from "../../../apps/trx/config/tokens.js";
import { queryTrxTokenBalance } from "../../../apps/trx/trc20.mjs";

process.stdout.on("error", (error) => {
  if (error?.code === "EPIPE") {
    process.exit(0);
  }
  throw error;
});

function parseAddressAssetsTestSection(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const out = [];
  let inSection = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("## address assets test")) {
      inSection = true;
      continue;
    }

    if (inSection && line.startsWith("#")) {
      break;
    }

    if (!inSection || !line) {
      continue;
    }

    const value = line.replace(/^[-*]\s*/, "").trim();
    if (!value) continue;
    out.push(value);
  }

  return out;
}

function detectNetwork(address) {
  const addr = String(address ?? "").trim();
  const isTrx = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
  const isBtc = /^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}/.test(addr) || /^04[0-9a-fA-F]{128}$/.test(addr);
  if (isTrx) return "mainnet";
  if (isBtc) return "btc";
  return "eth";
}

function resolveNetworksFromAddressCheck(address, checkResult) {
  const fallback = [detectNetwork(address)];
  if (!checkResult?.ok) return fallback;
  const items = Array.isArray(checkResult.items) ? checkResult.items : [];
  const item = items[0] ?? null;
  if (!item) return fallback;

  const chain = String(item.chain ?? "").toLowerCase();
  const mainnetNetworks = Array.isArray(item.mainnetNetworks)
    ? item.mainnetNetworks.filter(Boolean)
    : [];

  if (chain === "evm" && mainnetNetworks.length > 0) {
    return [...new Set(mainnetNetworks)];
  }
  if (chain === "trx") {
    return [mainnetNetworks[0] || "mainnet"];
  }
  if (chain === "btc") {
    return ["btc"];
  }

  return mainnetNetworks.length > 0 ? [...new Set(mainnetNetworks)] : fallback;
}

function isEvmAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(address ?? "").trim());
}

function isTrxAddress(address) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(address ?? "").trim());
}

function toBigIntSafe(value) {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.max(0, Math.floor(value)));
    if (typeof value === "string" && value.trim() !== "") return BigInt(value.trim());
  } catch {
    // ignore
  }
  return 0n;
}

async function collectTrxRemoteHoldingsDebug(address, network = "mainnet") {
  try {
    const provider = resolveTrxNetProvider(network);
    const raw = await provider.walletCall("getaccount", { address: toTrxHexAddress(address) });
    const list = Array.isArray(raw?.trc20) ? raw.trc20 : [];
    const contracts = [];

    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      for (const [contractAddress, balanceRaw] of Object.entries(item)) {
        const contract = String(contractAddress ?? "").trim();
        if (!contract) continue;
        if (toBigIntSafe(balanceRaw) <= 0n) continue;
        contracts.push(contract);
      }
    }

    const unique = [...new Set(contracts)];
    return {
      ok: true,
      rawTrc20Entries: list.length,
      nonZeroContracts: unique,
      nonZeroCount: unique.length,
    };
  } catch (error) {
    return {
      ok: false,
      rawTrc20Entries: 0,
      nonZeroContracts: [],
      nonZeroCount: 0,
      error: error?.message ?? String(error),
    };
  }
}

async function collectTrxTokenBookDebug(address, network = "mainnet") {
  try {
    const { tokens } = getTrxTokenBook({ network });
    const list = Object.values(tokens ?? {});
    const hits = [];

    await Promise.all(list.map(async (token) => {
      try {
        const result = await queryTrxTokenBalance({
          address,
          token: token.address,
          network,
        });
        if (toBigIntSafe(result?.balance) > 0n) {
          hits.push(String(token.address));
        }
      } catch {
        // ignore single-token failures in debug mode
      }
    }));

    const unique = [...new Set(hits)];
    return {
      ok: true,
      tokenBookSize: list.length,
      hitContracts: unique,
      hitCount: unique.length,
    };
  } catch (error) {
    return {
      ok: false,
      tokenBookSize: 0,
      hitContracts: [],
      hitCount: 0,
      error: error?.message ?? String(error),
    };
  }
}

function trimTrailingZeros(value) {
  const text = String(value ?? "0").trim();
  if (!text.includes(".")) return text;
  return text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function toBigIntOrNull(value) {
  if (typeof value === "bigint") return value;
  if (value == null) return null;
  try {
    const text = String(value).trim();
    if (!text) return null;
    return BigInt(text);
  } catch {
    return null;
  }
}

function formatRawWithDecimals(raw, decimals) {
  const value = toBigIntOrNull(raw);
  if (value == null) return null;
  const unit = Number.isFinite(Number(decimals)) ? Number(decimals) : 0;
  if (unit <= 0) return Number(value.toString());

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(unit);
  const whole = abs / base;
  const fraction = abs % base;
  const fractionText = fraction.toString().padStart(unit, "0").replace(/0+$/, "");
  const composed = fractionText
    ? `${negative ? "-" : ""}${whole.toString()}.${fractionText}`
    : `${negative ? "-" : ""}${whole.toString()}`;
  const n = Number(composed);
  return Number.isFinite(n) ? n : null;
}

function pickAssetLabel(asset = {}) {
  const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
  if (String(extra?.assetType ?? "") === "error") {
    return "API_ERROR";
  }
  if (extra?.assetType === "native") {
    const chain = String(asset?.chain ?? "").toLowerCase();
    if (chain === "btc") return "BTC";
    if (chain === "trx") return "TRX";
    return "ETH";
  }
  const base = String(asset?.symbol ?? asset?.title ?? "ASSET");
  return extra?.stale ? `${base} [STALE]` : base;
}

function pickQuantity(asset = {}) {
  const valuation = asset?.extra?.valuation && typeof asset.extra.valuation === "object"
    ? asset.extra.valuation
    : null;
  if (valuation && Number.isFinite(Number(valuation.quantity))) {
    return Number(valuation.quantity);
  }

  const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
  const nestedAsset = extra?.asset && typeof extra.asset === "object" ? extra.asset : {};

  if (typeof nestedAsset.formatted === "string" || typeof nestedAsset.formatted === "number") {
    const n = Number(nestedAsset.formatted);
    if (Number.isFinite(n)) return n;
  }

  const nestedDecimals = Number.isFinite(Number(nestedAsset.decimals))
    ? Number(nestedAsset.decimals)
    : (Number.isFinite(Number(asset?.decimals)) ? Number(asset.decimals) : 0);

  const byRawBalance = formatRawWithDecimals(nestedAsset.rawBalance, nestedDecimals);
  if (byRawBalance != null) return byRawBalance;

  const byAlchemyBalance = formatRawWithDecimals(nestedAsset.alchemyTokenBalance, nestedDecimals);
  if (byAlchemyBalance != null) return byAlchemyBalance;

  if (typeof extra.balance === "string" || typeof extra.balance === "number") {
    const n = Number(extra.balance);
    return Number.isFinite(n) ? n : 0;
  }

  if (typeof extra.confirmed === "string" || typeof extra.confirmed === "number") {
    const n = Number(extra.confirmed);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function pickPrice(asset = {}) {
  const valuation = asset?.extra?.valuation && typeof asset.extra.valuation === "object"
    ? asset.extra.valuation
    : null;
  const n = Number(valuation?.priceUsd ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pickValue(asset = {}) {
  const valuation = asset?.extra?.valuation && typeof asset.extra.valuation === "object"
    ? asset.extra.valuation
    : null;
  const n = Number(valuation?.valueUsd ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isHighRiskAsset(asset = {}) {
  const symbol = String(asset?.symbol ?? "").trim();
  const title = String(asset?.title ?? "").trim();
  const name = String(asset?.name ?? "").trim();
  const addr = String(asset?.tokenAddress ?? asset?.address ?? "").trim();
  const text = `${symbol} ${title} ${name} ${addr}`.toLowerCase();

  if (!text) return false;

  const riskKeywords = [
    "http://",
    "https://",
    "www.",
    ".com",
    ".org",
    ".net",
    "visit",
    "claim",
    "bonus",
    "reward",
    "secure",
    "urgent",
    "wallet",
    "drop",
  ];

  return riskKeywords.some((kw) => text.includes(kw));
}

async function main() {
  const debugMode = process.argv.includes("--debug");
  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
  const addresses = parseAddressAssetsTestSection(raw);
  const evmAddresses = addresses.filter((addr) => isEvmAddress(addr));
  const btcAddresses = addresses.filter((addr) => /^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}/.test(addr) || /^04[0-9a-fA-F]{128}$/.test(addr));
  const trxAddresses = addresses.filter((addr) => isTrxAddress(addr));
  const executableAddresses = [...addresses];

  console.log("🚀 === 地址批量资产查询（run.asset）===\n");
  console.log(`样本来源: ## address assets test`);
  console.log(`地址数量: ${addresses.length}`);
  console.log(`执行数量(EVM): ${evmAddresses.length}`);
  console.log(`执行数量(BTC): ${btcAddresses.length}`);
  console.log(`执行数量(TRX): ${trxAddresses.length}\n`);
  if (debugMode) {
    console.log("🔬 debug 模式: 开启（三链全开）\n");
  }

  if (addresses.length === 0) {
    console.log("未读取到地址样本，请检查 test.data.md 的 ## address assets test 段。\n");
    return;
  }

  for (const address of executableAddresses) {
    const addressCheck = await searchAddressCheckTask({ query: address });
    const networks = resolveNetworksFromAddressCheck(address, addressCheck);
    const detectedChain = String(addressCheck?.items?.[0]?.chain ?? "").toLowerCase();
    console.log(`地址: ${address}`);
    console.log(`  · addressCheck.mainnetNetworks=${Array.isArray(addressCheck?.items?.[0]?.mainnetNetworks) ? addressCheck.items[0].mainnetNetworks.join(",") : "-"}`);
    console.log(`  · 查询网络=${networks.join(",")}`);

    const useValuation = detectedChain === "btc";

    for (const network of networks) {
      const result = useValuation
        ? await searchAddressValuationTask({
          query: address,
          network,
          timeoutMs: 15000,
        })
        : await searchAddressAssetsTask({
          query: address,
          network,
          timeoutMs: 15000,
        });

      // TRX/EVM 价格逻辑暂不启用，先保持余额查询模式。
      // const result = await searchAddressValuationTask({ query: address, network, timeoutMs: 15000 });

      if (!result.ok) {
        console.log(`  ✗ network=${network} 失败: ${result.error}`);
        continue;
      }

      console.log(`  ✓ network=${result.network ?? network} assets=${result.assets.length}`);
      if (useValuation) {
        console.log(`    · totalValueUsd=${trimTrailingZeros(result.totalValueUsd ?? 0)}`);
      }

      if (debugMode && isTrxAddress(address)) {
        const remoteDebug = await collectTrxRemoteHoldingsDebug(address, network);
        if (remoteDebug.ok) {
          console.log(`    · debug.remote.trc20Entries=${remoteDebug.rawTrc20Entries} nonZero=${remoteDebug.nonZeroCount}`);
          if (remoteDebug.nonZeroCount > 0) {
            console.log(`    · debug.remote.sample=${remoteDebug.nonZeroContracts.slice(0, 5).join(", ")}`);
          }
        } else {
          console.log(`    · debug.remote.error=${remoteDebug.error}`);
        }

        const tokenBookDebug = await collectTrxTokenBookDebug(address, network);
        if (tokenBookDebug.ok) {
          console.log(`    · debug.tokenBook.size=${tokenBookDebug.tokenBookSize} hits=${tokenBookDebug.hitCount}`);
          if (tokenBookDebug.hitCount > 0) {
            console.log(`    · debug.tokenBook.sample=${tokenBookDebug.hitContracts.slice(0, 5).join(", ")}`);
          }
        } else {
          console.log(`    · debug.tokenBook.error=${tokenBookDebug.error}`);
        }
      }

      const allAssets = Array.isArray(result.assets) ? result.assets : [];
      const hiddenCount = allAssets.filter((asset) => isHighRiskAsset(asset)).length;

      const rows = [];
      const apiErrors = [];
      for (const asset of allAssets) {
        if (isHighRiskAsset(asset)) continue;
        const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
        if (String(extra?.assetType ?? "") === "error") {
          apiErrors.push({
            stage: extra.errorStage ?? "unknown",
            msg: extra.errorMessage ?? "unknown",
          });
          continue;
        }
        const label = pickAssetLabel(asset);
        const qty = pickQuantity(asset);
        const price = pickPrice(asset);
        const value = pickValue(asset);
        if (useValuation) {
          rows.push({
            asset: label,
            qty: trimTrailingZeros(qty),
            price: trimTrailingZeros(price),
            value: trimTrailingZeros(value),
          });
        } else {
          rows.push({
            asset: label,
            qty: trimTrailingZeros(qty),
          });
        }
      }

      if (rows.length > 0) {
        console.table(rows);
      } else {
        console.log("    · 无可展示资产");
      }

      if (hiddenCount > 0) {
        console.log(`    · 已隐藏高风险 token: ${hiddenCount}`);
      }

      for (const err of apiErrors) {
        console.log(`    - API_ERROR: stage=${err.stage} msg=${err.msg}`);
      }
    }

    console.log("");
  }

  console.log("✅ run.asset 完成\n");
}

main().catch((error) => {
  console.error("❌ run.asset 执行失败:", error);
  process.exit(1);
});
