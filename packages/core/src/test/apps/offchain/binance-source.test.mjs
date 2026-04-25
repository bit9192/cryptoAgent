import test from "node:test";
import assert from "node:assert/strict";

import { BinanceTickerSource } from "../../../apps/offchain/sources/binance/index.mjs";

function makeJsonResponse(data) {
  return {
    ok: true,
    status: 200,
    async json() {
      return data;
    },
  };
}

test("binance source: 批量一次请求并映射到 USD 价格", async () => {
  const source = new BinanceTickerSource();
  await source.init();

  const oldFetch = globalThis.fetch;
  const calledUrls = [];
  globalThis.fetch = async (url) => {
    calledUrls.push(String(url));
    return makeJsonResponse([
      { symbol: "BTCUSDT", price: "78000.12" },
      { symbol: "ETHUSDT", price: "4200.50" },
      { symbol: "BNBUSDT", price: "640.1" },
    ]);
  };

  try {
    const out = await source.getPrice(["bitcoin", "eth", "bnb", "usdt", "0x55d398326f99059ff775485246999027b3197955"]);

    assert.equal(calledUrls.length, 1);
    assert.match(calledUrls[0], /\/api\/v3\/ticker\/price$/);
    assert.equal(out.bitcoin.usd, 78000.12);
    assert.equal(out.eth.usd, 4200.5);
    assert.equal(out.bnb.usd, 640.1);
    assert.equal(out.usdt.usd, 1);
    assert.equal(out["0x55d398326f99059ff775485246999027b3197955"], null);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
