import { btcBalanceGet } from "../../assets/native-balance.mjs";

/**
 * 映射 btcBalanceGet 单条记录 → SearchItem（domain=address，assetType=native）
 */
function mapNativeBalanceItem(balanceItem, network) {
  const address = balanceItem.address;
  return {
    domain: "address",
    chain: "btc",
    network,
    id: `address:btc:${network}:${address}:native`,
    title: `BTC @ ${address.slice(0, 10)}...${address.slice(-6)}`,
    address,
    source: "bitcoin-node",
    confidence: 0.9,
    extra: {
      assetType: "native",
      confirmed: balanceItem.confirmed,
      unconfirmed: balanceItem.unconfirmed,
      utxoCount: balanceItem.utxoCount,
    },
  };
}

/**
 * native BTC 余额 resolver（适用于所有地址类型）
 *
 * @returns {{ resolve(input: { address: string, network: string }): Promise<SearchItem[]> }}
 */
export function createNativeBalanceResolver() {
  return {
    name: "native-balance",

    async resolve(input = {}) {
      const { address, network } = input;
      try {
        const result = await btcBalanceGet({ addresses: [address] }, network);
        const rows = Array.isArray(result?.rows) ? result.rows : [];
        return rows.map((item) => mapNativeBalanceItem(item, network));
      } catch {
        // 降级：resolver 失败不影响其他资产查询
        return [];
      }
    },
  };
}

export default {
  createNativeBalanceResolver,
};
