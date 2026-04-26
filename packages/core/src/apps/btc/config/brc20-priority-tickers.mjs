/**
 * BRC20 优先查询 ticker 列表（mainnet）
 * summary API 未返回这些 ticker 时，单独调用 brc20TokenInfoGet 兜底查询
 */
export const BRC20_PRIORITY_TICKERS = Object.freeze(["ordi", "sats", "rats"]);
