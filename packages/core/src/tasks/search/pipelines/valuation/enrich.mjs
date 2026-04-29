import { buildAssetValuationInput } from "./index.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeChainFromCandidate(candidate = {}) {
  return normalizeString(candidate?.chain).toLowerCase();
}

function roundValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e8) / 1e8;
}

export function sumAssetValuationValue(assets = []) {
  if (!Array.isArray(assets) || assets.length === 0) return 0;
  return roundValue(assets.reduce((sum, asset) => {
    const valueUsd = Number(asset?.extra?.valuation?.valueUsd ?? 0);
    return sum + (Number.isFinite(valueUsd) ? valueUsd : 0);
  }, 0));
}

export async function enrichAssetsWithValuation(assets = [], fallbackNetwork = null, options = {}) {
  const inputAssets = Array.isArray(assets) ? assets : [];
  if (inputAssets.length === 0) {
    return {
      assets: [],
      totalValueUsd: 0,
    };
  }

  const rows = [];
  const priceInputs = [];
  const priceInputIndexes = new Map();

  for (let i = 0; i < inputAssets.length; i += 1) {
    const asset = inputAssets[i];
    const chain = normalizeChainFromCandidate(asset);
    const assetNetwork = normalizeString(asset?.network ?? fallbackNetwork);
    const valuationInput = buildAssetValuationInput(chain, asset, assetNetwork);
    const quantity = Number(valuationInput?.quantity ?? 0);
    const priceQuery = normalizeString(valuationInput?.priceQuery);
    const priceNetwork = normalizeString(valuationInput?.priceNetwork);
    const allowPricing = valuationInput?.allowPricing !== false;

    rows.push({ quantity, priceQuery, priceNetwork, chain, allowPricing });
    if (!allowPricing) continue;
    if (!priceQuery || !priceNetwork) continue;

    const key = `${chain}:${priceNetwork}:${priceQuery.toLowerCase()}`;
    if (priceInputIndexes.has(key)) continue;
    priceInputIndexes.set(key, priceInputs.length);
    priceInputs.push({ query: priceQuery, network: priceNetwork, chain });
  }

  let batchItems = [];
  try {
    if (typeof options?.priceBatchQuery === "function") {
      const batch = await options.priceBatchQuery(priceInputs);
      batchItems = Array.isArray(batch?.items) ? batch.items : [];
    }
  } catch {
    batchItems = [];
  }

  let totalValueUsd = 0;
  const enriched = inputAssets.map((asset, index) => {
    const row = rows[index] ?? {};
    const key = `${row.chain}:${row.priceNetwork}:${String(row.priceQuery ?? "").toLowerCase()}`;
    const batchIndex = priceInputIndexes.get(key);
    const priceRow = batchIndex != null ? batchItems[batchIndex] : null;
    const priceUsd = row.allowPricing === false ? 0 : Number(priceRow?.priceUsd ?? 0);
    const safePrice = Number.isFinite(priceUsd) ? priceUsd : 0;
    const quantity = Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : 0;
    const valueUsd = roundValue(quantity * safePrice);
    totalValueUsd += valueUsd;

    return {
      ...asset,
      extra: {
        ...(asset?.extra && typeof asset.extra === "object" ? asset.extra : {}),
        valuation: {
          quantity,
          priceUsd: safePrice,
          valueUsd,
          priceSource: priceRow?.source ?? null,
        },
      },
    };
  });

  return {
    assets: enriched,
    totalValueUsd: roundValue(totalValueUsd),
  };
}

export default {
  sumAssetValuationValue,
  enrichAssetsWithValuation,
};