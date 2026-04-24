function normalizeKeyPart(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toBigInt(value) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new TypeError(`balance 不是整数: ${String(value)}`);
    }
    return BigInt(value);
  }
  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0n;
  }
  if (!/^-?\d+$/.test(raw)) {
    throw new TypeError(`balance 不是整数: ${raw}`);
  }
  return BigInt(raw);
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.floor(n));
}

function formatBalanceDecimal(balanceRaw, decimals) {
  const scale = toInt(decimals, 0);
  const sign = balanceRaw < 0n ? "-" : "";
  const abs = balanceRaw < 0n ? -balanceRaw : balanceRaw;
  if (scale === 0) {
    return `${sign}${abs.toString()}`;
  }

  const raw = abs.toString().padStart(scale + 1, "0");
  const intPart = raw.slice(0, -scale) || "0";
  const fracRaw = raw.slice(-scale);
  const fracPart = fracRaw.replace(/0+$/, "");
  return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolvePriceMap(prices = []) {
  const map = new Map();
  for (const row of Array.isArray(prices) ? prices : []) {
    const key = [
      normalizeKeyPart(row.chain),
      normalizeKeyPart(row.tokenAddress ?? row.token),
    ].join(":");
    if (!key || key === ":") {
      continue;
    }
    map.set(key, toNumberOrNull(row.priceUsd));
  }
  return map;
}

function resolveRiskMap(risks = []) {
  const map = new Map();
  for (const row of Array.isArray(risks) ? risks : []) {
    const key = [
      normalizeKeyPart(row.chain),
      normalizeKeyPart(row.tokenAddress ?? row.token),
    ].join(":");
    if (!key || key === ":") {
      continue;
    }
    map.set(key, {
      level: String(row.level ?? row.riskLevel ?? "unknown").trim().toLowerCase() || "unknown",
      score: toNumberOrNull(row.score),
      source: row.source ?? null,
    });
  }
  return map;
}

function mergeSnapshotRows(inputRows = []) {
  const merged = new Map();

  for (const row of Array.isArray(inputRows) ? inputRows : []) {
    const chain = String(row.chain ?? "").trim().toLowerCase() || "unknown";
    const ownerAddress = String(row.ownerAddress ?? row.address ?? "").trim() || null;
    const tokenAddress = String(row.tokenAddress ?? row.token ?? "").trim() || null;
    const symbol = String(row.symbol ?? "").trim() || null;
    const name = String(row.name ?? "").trim() || null;
    const decimals = toInt(row.decimals, 0);
    const balanceRaw = toBigInt(row.balanceRaw ?? row.balance ?? 0n);

    const key = [
      normalizeKeyPart(chain),
      normalizeKeyPart(ownerAddress),
      normalizeKeyPart(tokenAddress),
    ].join(":");

    const existed = merged.get(key);
    if (!existed) {
      merged.set(key, {
        index: merged.size,
        chain,
        ownerAddress,
        tokenAddress,
        symbol,
        name,
        decimals,
        balanceRaw,
      });
      continue;
    }

    existed.balanceRaw += balanceRaw;
    if (!existed.symbol && symbol) existed.symbol = symbol;
    if (!existed.name && name) existed.name = name;
    if (!Number.isFinite(existed.decimals) && Number.isFinite(decimals)) {
      existed.decimals = decimals;
    }
  }

  return Array.from(merged.values());
}

export function aggregateAssetSnapshot(options = {}) {
  const balances = Array.isArray(options.balances) ? options.balances : [];
  const prices = resolvePriceMap(options.prices);
  const risks = resolveRiskMap(options.risks);

  const mergedRows = mergeSnapshotRows(balances);
  const items = mergedRows.map((row) => {
    const priceKey = `${normalizeKeyPart(row.chain)}:${normalizeKeyPart(row.tokenAddress)}`;
    const priceUsd = prices.has(priceKey) ? prices.get(priceKey) : null;
    const risk = risks.get(priceKey) ?? {
      level: "unknown",
      score: null,
      source: null,
    };

    const balance = formatBalanceDecimal(row.balanceRaw, row.decimals);
    const balanceNum = Number(balance);
    const valueUsd = priceUsd == null || !Number.isFinite(balanceNum)
      ? null
      : balanceNum * priceUsd;

    return {
      chain: row.chain,
      ownerAddress: row.ownerAddress,
      tokenAddress: row.tokenAddress,
      symbol: row.symbol,
      name: row.name,
      decimals: row.decimals,
      balanceRaw: row.balanceRaw,
      balance,
      priceUsd,
      valueUsd,
      riskLevel: risk.level,
      riskScore: risk.score,
      riskSource: risk.source,
      _index: row.index,
    };
  });

  items.sort((a, b) => {
    const av = a.valueUsd;
    const bv = b.valueUsd;

    if (av == null && bv != null) return 1;
    if (av != null && bv == null) return -1;
    if (av != null && bv != null && bv !== av) return bv - av;

    return a._index - b._index;
  });

  return {
    ok: true,
    items: items.map(({ _index, ...rest }) => rest),
    summary: {
      totalItems: items.length,
      pricedItems: items.filter((x) => x.valueUsd != null).length,
      unpricedItems: items.filter((x) => x.valueUsd == null).length,
      totalValueUsd: items.reduce((sum, x) => sum + (x.valueUsd ?? 0), 0),
    },
  };
}

export default {
  aggregateAssetSnapshot,
};
