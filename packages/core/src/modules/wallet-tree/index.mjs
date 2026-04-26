function asArray(value) {
  return Array.isArray(value) ? value : null;
}

function sortAccounts(a, b) {
  const byName = String(a.keyName ?? "").localeCompare(String(b.keyName ?? ""));
  if (byName !== 0) return byName;
  return String(a.keyId ?? "").localeCompare(String(b.keyId ?? ""));
}

function sortAddresses(a, b) {
  const byName = String(a.name ?? "").localeCompare(String(b.name ?? ""));
  if (byName !== 0) return byName;
  const byPath = String(a.path ?? "").localeCompare(String(b.path ?? ""));
  if (byPath !== 0) return byPath;
  return String(a.address ?? "").localeCompare(String(b.address ?? ""));
}

function safeText(value) {
  return String(value ?? "").trim();
}

export function buildWalletTree(input = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("wallet tree 输入不能为空");
  }

  const keys = asArray(input.keys);
  const addresses = asArray(input.addresses);
  if (!keys) {
    throw new Error("wallet tree 输入缺少 keys 数组");
  }
  if (!addresses) {
    throw new Error("wallet tree 输入缺少 addresses 数组");
  }

  const warnings = [];
  const accountMap = new Map();

  for (const key of keys) {
    const keyId = safeText(key?.keyId);
    if (!keyId) {
      warnings.push("跳过无 keyId 的 key 条目");
      continue;
    }

    const keyName = safeText(key?.keyName) || keyId;
    if (!accountMap.has(keyId)) {
      accountMap.set(keyId, {
        id: `account:${keyId}`,
        keyId,
        keyName,
        chains: new Map(),
      });
    }
  }

  for (const item of addresses) {
    const keyId = safeText(item?.keyId);
    const chain = safeText(item?.chain).toLowerCase();
    const address = safeText(item?.address);
    if (!keyId || !chain || !address) {
      warnings.push("跳过无效地址条目：缺少 keyId/chain/address");
      continue;
    }

    if (!accountMap.has(keyId)) {
      accountMap.set(keyId, {
        id: `account:${keyId}`,
        keyId,
        keyName: keyId,
        chains: new Map(),
      });
    }

    const account = accountMap.get(keyId);
    if (!account.chains.has(chain)) {
      account.chains.set(chain, {
        id: `chain:${keyId}:${chain}`,
        chain,
        addresses: [],
      });
    }

    const chainNode = account.chains.get(chain);
    const path = safeText(item?.path) || null;
    const name = safeText(item?.name) || null;
    const addressType = safeText(item?.addressType) || null;
    const addressId = safeText(item?.addressId) || `${keyId}:${chain}:${address}:${path ?? "-"}:${name ?? "-"}`;
    chainNode.addresses.push({
      id: `address:${addressId}`,
      address,
      name,
      path,
      addressType,
    });
  }

  const accounts = Array.from(accountMap.values())
    .sort(sortAccounts)
    .map((account) => {
      const chains = Array.from(account.chains.values())
        .sort((a, b) => a.chain.localeCompare(b.chain))
        .map((chainNode) => ({
          id: chainNode.id,
          chain: chainNode.chain,
          addresses: chainNode.addresses.sort(sortAddresses),
        }));

      return {
        id: account.id,
        keyId: account.keyId,
        keyName: account.keyName,
        chains,
      };
    });

  const counts = {
    accounts: accounts.length,
    chains: accounts.reduce((sum, account) => sum + account.chains.length, 0),
    addresses: accounts.reduce(
      (sum, account) => sum + account.chains.reduce((x, chainNode) => x + chainNode.addresses.length, 0),
      0,
    ),
  };

  return {
    ok: true,
    tree: accounts,
    counts,
    warnings,
  };
}

export default buildWalletTree;