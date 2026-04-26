import test from "node:test";
import assert from "node:assert/strict";
import * as bitcoin from "bitcoinjs-lib";

import {
  parseBtcAddress,
  convertBtcAddressNetwork,
  convertBtcAddressAllNetworks,
} from "../../../apps/btc/address.mjs";

test("btc/address-convert: base58 主网地址可转换为 testnet/regtest", () => {
  const mainnet = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  const result = convertBtcAddressAllNetworks(mainnet);

  assert.equal(result.sourceNetwork, "mainnet");
  assert.equal(result.format, "base58");
  assert.equal(result.kind, "p2pkh");
  assert.equal(result.mainnet, mainnet);
  assert.equal(result.testnet, "mpXwg4jMtRhuSpVq4xS3HFHmCmWp9NyGKt");
  assert.equal(result.regtest, "mpXwg4jMtRhuSpVq4xS3HFHmCmWp9NyGKt");
});

test("btc/address-convert: bech32 地址可转换为 testnet/regtest 前缀", () => {
  const mainnetBech32 = bitcoin.address.toBech32(Buffer.alloc(20, 1), 0, "bc");
  const result = convertBtcAddressAllNetworks(mainnetBech32);

  assert.equal(result.sourceNetwork, "mainnet");
  assert.equal(result.format, "bech32");
  assert.equal(result.mainnet.startsWith("bc1"), true);
  assert.equal(result.testnet.startsWith("tb1"), true);
  assert.equal(result.regtest.startsWith("bcrt1"), true);
});

test("btc/address-convert: 单网络转换可 round-trip", () => {
  const mainnet = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";

  const toTestnet = convertBtcAddressNetwork(mainnet, "testnet");
  const backMainnet = convertBtcAddressNetwork(toTestnet.output, "mainnet");

  assert.equal(toTestnet.sourceNetwork, "mainnet");
  assert.equal(toTestnet.targetNetwork, "testnet");
  assert.equal(backMainnet.output, mainnet);
});

test("btc/address-convert: parse 返回基础结构", () => {
  const parsed = parseBtcAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");

  assert.equal(parsed.format, "base58");
  assert.equal(parsed.kind, "p2pkh");
  assert.equal(parsed.network, "mainnet");
  assert(parsed.hash instanceof Uint8Array);
  assert.equal(parsed.hash.length, 20);
});

test("btc/address-convert: 非法地址会抛错", () => {
  assert.throws(
    () => convertBtcAddressAllNetworks("not-a-btc-address"),
    /无效 BTC 地址/
  );
});

test("btc/address-convert: TRX 地址不能被当成 BTC Base58 地址", () => {
  assert.throws(
    () => parseBtcAddress("TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h"),
    /无效 BTC 地址/
  );
});
