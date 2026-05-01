function safeText(value) {
  return String(value ?? "").trim();
}

function makeTokenId(network, address) {
  return `token:trx:${network}:${address}`;
}

export function toTokenSearchItem(token, network) {
  const symbol = safeText(token?.symbol).toUpperCase();
  const name = safeText(token?.name);
  const address = safeText(token?.address);
  const title = `${name || symbol} (${symbol})`;
  const source = safeText(token?.source) || "config";
  const confidence = Number.isFinite(Number(token?.confidence))
    ? Number(token.confidence)
    : (source === "config" ? 1 : 0.78);
  const extra = token?.extra && typeof token.extra === "object" ? token.extra : {};

  return {
    domain: "token",
    chain: "trx",
    network,
    id: makeTokenId(network, address),
    title,
    symbol,
    name,
    address,
    source,
    confidence,
    extra: {
      name,
      decimals: Number(token?.decimals ?? 0),
      protocol: "trc20",
      ...extra,
    },
  };
}

export default {
  toTokenSearchItem,
};
