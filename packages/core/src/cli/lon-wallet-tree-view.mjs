function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function countAddresses(addresses = {}) {
  let total = 0;
  for (const value of Object.values(addresses)) {
    if (Array.isArray(value)) {
      total += value.length;
      continue;
    }
    if (String(value ?? "").trim()) total += 1;
  }
  return total;
}

export function buildWalletTreeSummary(data = {}) {
  const tree = asArray(data?.tree);
  const warnings = asArray(data?.warnings);

  const grouped = new Map();
  for (const row of tree) {
    const keyId = String(row?.keyId ?? "").trim();
    if (!keyId) continue;
    const current = grouped.get(keyId) ?? {
      keyId,
      keyName: null,
      rowCount: 0,
      chainsSet: new Set(),
      addresses: 0,
    };

    current.rowCount += 1;
    if (String(row?.sourceType ?? "") === "orig") {
      current.keyName = String(row?.name ?? "").trim() || current.keyName;
    }

    const addresses = row?.addresses && typeof row.addresses === "object" ? row.addresses : {};
    for (const chain of Object.keys(addresses)) {
      current.chainsSet.add(chain);
    }
    current.addresses += countAddresses(addresses);

    grouped.set(keyId, current);
  }

  const accounts = Array.from(grouped.values()).map((item) => ({
    keyId: item.keyId,
    keyName: item.keyName,
    rows: item.rowCount,
    chains: Array.from(item.chainsSet.values()).sort(),
    addresses: item.addresses,
  }));

  const counts = {
    accounts: asCount(data?.counts?.accounts),
    chains: asCount(data?.counts?.chains),
    addresses: asCount(data?.counts?.addresses),
    warnings: warnings.length,
  };

  return {
    ok: Boolean(data?.ok),
    action: "wallet.tree.summary",
    counts,
    accounts,
  };
}

export default buildWalletTreeSummary;