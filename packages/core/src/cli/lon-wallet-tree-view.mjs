function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function buildWalletTreeSummary(data = {}) {
  const tree = asArray(data?.tree);
  const warnings = asArray(data?.warnings);

  const accounts = tree.map((account) => {
    const chains = asArray(account?.chains).map((chainNode) => ({
      chain: String(chainNode?.chain ?? "").trim(),
      addresses: asArray(chainNode?.addresses).length,
    }));

    return {
      keyId: String(account?.keyId ?? "").trim(),
      keyName: String(account?.keyName ?? "").trim() || null,
      chains,
      addresses: chains.reduce((sum, item) => sum + item.addresses, 0),
    };
  });

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