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

  return {
    domain: "token",
    chain: "trx",
    network,
    id: makeTokenId(network, address),
    title,
    symbol,
    name,
    address,
    source: "config",
    confidence: 1,
    extra: {
      name,
      decimals: Number(token?.decimals ?? 0),
      protocol: "trc20",
    },
  };
}

export default {
  toTokenSearchItem,
};
