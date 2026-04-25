import { brc20SummaryGet } from "../../brc20.mjs";

/**
 * 映射 brc20SummaryGet row → SearchItem（domain=address，assetType=brc20）
 */
function mapBrc20BalanceItem(row, address, network) {
  const ticker = String(row.ticker ?? row.tick ?? "").toUpperCase();
  return {
    domain: "address",
    chain: "btc",
    network,
    id: `address:btc:${network}:${address}:brc20:${ticker.toLowerCase()}`,
    title: `${ticker} @ ${address.slice(0, 10)}...${address.slice(-6)}`,
    address,
    source: "unisat",
    confidence: 0.85,
    extra: {
      assetType: "brc20",
      ticker,
      balance: String(row.overallBalance ?? row.balance ?? "0"),
      availableBalance: String(row.availableBalance ?? "0"),
      transferableBalance: String(row.transferableBalance ?? "0"),
      decimals: Number(row.decimals ?? 18),
    },
  };
}

/**
 * BRC20 资产余额 resolver（仅 P2TR / Taproot 地址可用）
 *
 * @returns {{ resolve(input: { address: string, network: string }): Promise<SearchItem[]> }}
 */
export function createBrc20BalanceResolver() {
  return {
    name: "brc20-balance",

    async resolve(input = {}) {
      const { address, network } = input;
      try {
        const result = await brc20SummaryGet(
          { address, excludeZero: true, limit: 16 },
          network,
        );
        const rows = Array.isArray(result?.rows) ? result.rows : [];
        return rows.map((row) => mapBrc20BalanceItem(row, address, network));
      } catch {
        // 降级：resolver 失败不影响其他资产查询
        return [];
      }
    },
  };
}

export default {
  createBrc20BalanceResolver,
};
