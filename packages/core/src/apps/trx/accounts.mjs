const DEFAULT_TRX_PATH_PREFIX = "m/44'/195'/0'/0/";

function resolvePath(index, pathPrefix = DEFAULT_TRX_PATH_PREFIX) {
  return `${String(pathPrefix ?? DEFAULT_TRX_PATH_PREFIX).trim()}${index}`;
}

export async function trxAccounts(options = {}) {
  const wallet = options.wallet;
  if (!wallet || typeof wallet.listKeys !== "function" || typeof wallet.getSigner !== "function") {
    throw new Error("trxAccounts: 需要传入 wallet 实例");
  }

  const networkName = String(options.networkName ?? options.network ?? "mainnet").trim() || "mainnet";
  const pathPrefix = String(options.pathPrefix ?? DEFAULT_TRX_PATH_PREFIX);
  const keyIdSet = Array.isArray(options.keyIds) && options.keyIds.length > 0
    ? new Set(options.keyIds.map((v) => String(v).trim()).filter(Boolean))
    : null;

  const listed = await wallet.listKeys({ enabled: true });
  const items = Array.isArray(listed?.items) ? listed.items : [];

  const rows = [];
  let index = 0;
  for (const item of items) {
    if (keyIdSet && !keyIdSet.has(item.keyId)) continue;

    try {
      const { signer } = await wallet.getSigner({
        chain: "trx",
        keyId: item.keyId,
        options: { network: networkName },
      });
      const path = resolvePath(index, pathPrefix);
      const address = await signer.getAddress({ path });

      rows.push({
        keyId: item.keyId,
        name: item.name,
        address,
        path,
        networkName,
        signer,
      });
      index += 1;
    } catch {
      // ignore keys unavailable for trx signer creation
    }
  }

  return rows;
}

export default {
  trxAccounts,
};
