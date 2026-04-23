/**
 * BTC Write API 单元测试
 *
 * 使用 mock netProvider，不依赖真实节点。
 * 验证 btcTxBuild 的 UTXO 选择、找零、手续费、PSBT 构建逻辑，
 * 以及通过 mock wallet signer 的完整 build→sign→broadcast 流程。
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";

import { btcTxBuild, btcTxSign, btcTxBroadcast } from "../../../apps/btc/write.mjs";
import { createBtcProvider } from "../../../apps/btc/provider.mjs";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// ── mock netProvider（不需要真实节点）─────────────────────────────────────────
function makeMockNetProvider(networkName = "regtest", utxos = []) {
  return {
    networkName,
    chain: "btc",
    adapter: {
      name: "mock",
      supports: (cap) => ["getUtxos", "sendTx"].includes(cap),
      getUtxos: async () => utxos,
      sendTx: async (hex) => `mock-txid-${hex.slice(0, 8)}`,
    },
    supports: (cap) => ["getUtxos", "sendTx"].includes(cap),
  };
}

// ── UTXO 格式（模拟 mempool adapter 返回的 amount 字段，BTC 浮点）────────────
function makeUtxo(txid, vout, address, amountBtc, confirmed = true) {
  return { txid, vout, address, amount: amountBtc, confirmed };
}

// ── mock wallet signer（用 test.key.md 助记词）────────────────────────────────
const TEST_MNEMONIC =
  "side dog pig sausage retire trap voyage wool fox awake ripple defense remove bright palm unknown rail grocery embody recipe absurd rude boat useless";

function makeMockWallet() {
  return {
    withUnlockedSecret: async (_input, executor) =>
      executor({ type: "mnemonic", value: TEST_MNEMONIC }),
    audit: async () => {},
  };
}

async function makeSigner(networkName = "regtest") {
  const provider = createBtcProvider();
  return provider.createSigner({
    wallet: makeMockWallet(),
    keyId: "test-write",
    options: { network: networkName },
  });
}

// ── 测试地址（来自 test.key.md regtest p2wpkh index=0/1）───────────────────
const REGTEST_P2WPKH_0 = "bcrt1qe38akah45pc230agwmzx5wawwxrs0v4287hajs";
const REGTEST_P2WPKH_1 = "bcrt1qaj7xjx360uzkd88kclp2pmv2qj0g6dky69gak3";
const REGTEST_P2TR_0   = "bcrt1pk6qs37n2awsscuavqp2rmcpqlhpvzjfytp00nslhg8ql5cmdp7wshcy3ek";

// ─────────────────────────────────────────────────────────────────────────────
// btcTxBuild 单元测试
// ─────────────────────────────────────────────────────────────────────────────

test("btcTxBuild: 单 UTXO 足额，有找零", async () => {
  const utxos = [
    makeUtxo("a".repeat(64), 0, REGTEST_P2WPKH_0, 0.001), // 100000 sats
  ];
  const built = await btcTxBuild(
    {
      fromAddresses: [{ address: REGTEST_P2WPKH_0, derivePath: "m/84'/1'/0'/0/0", addressType: "p2wpkh" }],
      to: REGTEST_P2WPKH_1,
      amountSats: 50000,
      feeRateSatVb: 10,
    },
    makeMockNetProvider("regtest", utxos),
  );

  assert.equal(built.ok, true, "ok 应为 true");
  assert.ok(built.psbtBase64, "应返回 psbtBase64");
  assert.equal(built.signingRequests.length, 1, "应有 1 个签名请求");
  assert.equal(built.signingRequests[0].inputIndex, 0);
  assert.equal(built.signingRequests[0].derivePath, "m/84'/1'/0'/0/0");
  assert.equal(built.signingRequests[0].addressType, "p2wpkh");
  assert.ok(built.changeSats > 0, `找零 ${built.changeSats} 应 >0`);
  assert.ok(built.estimatedFeeSats > 0, "手续费应 >0");
  // 基本守恒：输入 = 发送 + 找零 + 手续费
  assert.equal(50000 + built.changeSats + built.estimatedFeeSats, 100000);
});

test("btcTxBuild: 多 UTXO 合并，amount 字段自动转 sats", async () => {
  const utxos = [
    makeUtxo("b".repeat(64), 0, REGTEST_P2WPKH_0, 0.0002), // 20000 sats
    makeUtxo("c".repeat(64), 1, REGTEST_P2WPKH_0, 0.0003), // 30000 sats
  ];
  const built = await btcTxBuild(
    {
      fromAddresses: [{ address: REGTEST_P2WPKH_0, derivePath: "m/84'/1'/0'/0/0", addressType: "p2wpkh" }],
      to: REGTEST_P2WPKH_1,
      amountSats: 40000,
      feeRateSatVb: 5,
    },
    makeMockNetProvider("regtest", utxos),
  );

  assert.equal(built.ok, true);
  assert.equal(built.selectedUtxos, 2, "应选 2 个 UTXO（合计 50000 才够）");
  assert.ok(built.changeSats > 0);
});

test("btcTxBuild: 找零低于 dust 时全部计入手续费", async () => {
  const utxos = [
    makeUtxo("d".repeat(64), 0, REGTEST_P2WPKH_0, 0.0005015), // 50150 sats
  ];
  const built = await btcTxBuild(
    {
      fromAddresses: [{ address: REGTEST_P2WPKH_0, derivePath: "m/84'/1'/0'/0/0", addressType: "p2wpkh" }],
      to: REGTEST_P2WPKH_1,
      amountSats: 50000,       // 余量 150 sats，低于 dust=546
      feeRateSatVb: 1,
      dustThreshold: 546,
    },
    makeMockNetProvider("regtest", utxos),
  );

  assert.equal(built.ok, true);
  assert.equal(built.changeSats, 0, "找零应为 0（低于 dust）");
  // 无找零输出：守恒 = 全部 UTXO 都用掉
});

test("btcTxBuild: 余额不足应抛出 BTC_INSUFFICIENT_FUNDS", async () => {
  const utxos = [
    makeUtxo("e".repeat(64), 0, REGTEST_P2WPKH_0, 0.0001), // 10000 sats
  ];
  await assert.rejects(
    () => btcTxBuild(
      {
        fromAddresses: [{ address: REGTEST_P2WPKH_0, derivePath: "m/84'/1'/0'/0/0", addressType: "p2wpkh" }],
        to: REGTEST_P2WPKH_1,
        amountSats: 50000,
        feeRateSatVb: 10,
      },
      makeMockNetProvider("regtest", utxos),
    ),
    (err) => {
      assert.equal(err.code, "BTC_INSUFFICIENT_FUNDS");
      return true;
    },
  );
});

test("btcTxBuild: 没有 UTXO 应抛出 BTC_TX_BUILD_FAILED", async () => {
  await assert.rejects(
    () => btcTxBuild(
      {
        fromAddresses: [{ address: REGTEST_P2WPKH_0, derivePath: "m/84'/1'/0'/0/0", addressType: "p2wpkh" }],
        to: REGTEST_P2WPKH_1,
        amountSats: 10000,
      },
      makeMockNetProvider("regtest", []),
    ),
    (err) => {
      assert.equal(err.code, "BTC_TX_BUILD_FAILED");
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// build → sign 端到端（regtest p2wpkh）
// ─────────────────────────────────────────────────────────────────────────────

test("btcTxBuild + btcTxSign: p2wpkh 完整构建并签名", async () => {
  // 单 UTXO，100000 sats
  const utxos = [
    makeUtxo("f".repeat(64), 0, REGTEST_P2WPKH_0, 0.001),
  ];
  const netProvider = makeMockNetProvider("regtest", utxos);

  const built = await btcTxBuild(
    {
      fromAddresses: [{
        address: REGTEST_P2WPKH_0,
        derivePath: "m/84'/1'/0'/0/0",
        addressType: "p2wpkh",
      }],
      to: REGTEST_P2WPKH_1,
      amountSats: 50000,
      feeRateSatVb: 10,
    },
    netProvider,
  );
  assert.equal(built.ok, true);

  const signer = await makeSigner("regtest");
  const signed = await btcTxSign(built, signer);

  assert.equal(signed.ok, true, "签名应成功");
  assert.equal(signed.operation, "signPsbt");
  assert.ok(signed.result?.txHex, "应返回 txHex");
  assert.ok(signed.result?.txid, "应返回 txid");
  // txHex 是合法 hex
  assert.ok(/^[0-9a-f]+$/i.test(signed.result.txHex));
});

test("btc signer.signPsbt: finalize=false 时返回已签名 PSBT", async () => {
  const utxos = [
    makeUtxo("1".repeat(64), 0, REGTEST_P2WPKH_0, 0.001),
  ];
  const built = await btcTxBuild(
    {
      fromAddresses: [{
        address: REGTEST_P2WPKH_0,
        derivePath: "m/84'/1'/0'/0/0",
        addressType: "p2wpkh",
      }],
      to: REGTEST_P2WPKH_1,
      amountSats: 50000,
      feeRateSatVb: 10,
    },
    makeMockNetProvider("regtest", utxos),
  );

  const signer = await makeSigner("regtest");
  const signed = await signer.signPsbt({
    ...built,
    finalize: false,
  });

  assert.equal(signed.ok, true);
  assert.equal(signed.meta?.finalized, false);
  assert.equal(signed.result?.finalized, false);
  assert.ok(signed.result?.psbtBase64, "应返回 psbtBase64");
  assert.ok(signed.result?.psbtHex, "应返回 psbtHex");
  assert.equal(typeof signed.result?.txHex, "undefined");
});

test("btcTxBuild + btcTxSign: p2tr 完整构建并签名", async () => {
  // p2tr 输入需要 tapInternalKey，先通过 getPublicKey 获取
  const signer = await makeSigner("regtest");
  const { xOnlyPubKey } = await signer.getPublicKey({
    addressType: "p2tr",
    path: "m/86'/1'/0'/0/0",
  });

  const utxos = [
    makeUtxo("9".repeat(64), 0, REGTEST_P2TR_0, 0.001),
  ];
  const netProvider = makeMockNetProvider("regtest", utxos);

  const built = await btcTxBuild(
    {
      fromAddresses: [{
        address: REGTEST_P2TR_0,
        derivePath: "m/86'/1'/0'/0/0",
        addressType: "p2tr",
        tapInternalKey: xOnlyPubKey,
      }],
      to: REGTEST_P2WPKH_1,
      amountSats: 50000,
      feeRateSatVb: 10,
    },
    netProvider,
  );
  assert.equal(built.ok, true);

  const signed = await btcTxSign(built, signer);

  assert.equal(signed.ok, true);
  assert.ok(signed.result?.txHex);
  assert.ok(/^[0-9a-f]+$/i.test(signed.result.txHex));
});

test("btcTxBuild + btcTxSign: p2wsh 2-of-2 多签完整构建并签名", async () => {
  const signer = await makeSigner("regtest");
  const path1 = "m/84'/1'/0'/0/10";
  const path2 = "m/84'/1'/0'/0/11";

  const { publicKey: pub1 } = await signer.getPublicKey({ addressType: "p2wpkh", path: path1 });
  const { publicKey: pub2 } = await signer.getPublicKey({ addressType: "p2wpkh", path: path2 });

  const p2ms = bitcoin.payments.p2ms({
    m: 2,
    pubkeys: [pub1, pub2],
    network: bitcoin.networks.regtest,
  });
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: p2ms,
    network: bitcoin.networks.regtest,
  });
  const multisigAddr = p2wsh.address;

  const utxos = [
    makeUtxo("7".repeat(64), 0, multisigAddr, 0.0015),
  ];
  const netProvider = makeMockNetProvider("regtest", utxos);

  const built = await btcTxBuild(
    {
      fromAddresses: [{
        address: multisigAddr,
        derivePaths: [path1, path2],
        addressType: "p2wsh-multisig",
        witnessScript: Buffer.from(p2ms.output).toString("hex"),
      }],
      to: REGTEST_P2WPKH_1,
      amountSats: 50000,
      feeRateSatVb: 10,
      changeAddress: multisigAddr,
    },
    netProvider,
  );
  assert.equal(built.ok, true);
  assert.equal(built.signingRequests.length, 2, "同一输入应生成两个签名请求");

  const signed = await btcTxSign(built, signer);

  assert.equal(signed.ok, true);
  assert.ok(signed.result?.txHex);
  assert.ok(/^[0-9a-f]+$/i.test(signed.result.txHex));
});

// ─────────────────────────────────────────────────────────────────────────────
// btcTxBroadcast 单元测试（mock adapter）
// ─────────────────────────────────────────────────────────────────────────────

test("btcTxBroadcast: 成功广播应返回 txid", async () => {
  const netProvider = makeMockNetProvider("regtest", []);
  const result = await btcTxBroadcast("deadbeef1234", netProvider);

  assert.equal(result.ok, true);
  assert.ok(result.txid.startsWith("mock-txid-"), `txid: ${result.txid}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 完整三段式 build → sign → broadcast
// ─────────────────────────────────────────────────────────────────────────────

test("完整流程: build → sign → broadcast (p2wpkh regtest)", async () => {
  const utxos = [makeUtxo("a1b2c3".padEnd(64, "0"), 0, REGTEST_P2WPKH_0, 0.001)];
  const netProvider = makeMockNetProvider("regtest", utxos);
  const signer = await makeSigner("regtest");

  // 1. build
  const built = await btcTxBuild(
    {
      fromAddresses: [{
        address: REGTEST_P2WPKH_0,
        derivePath: "m/84'/1'/0'/0/0",
        addressType: "p2wpkh",
      }],
      to: REGTEST_P2WPKH_1,
      amountSats: 30000,
      feeRateSatVb: 5,
    },
    netProvider,
  );
  assert.equal(built.ok, true);

  // 2. sign
  const signed = await btcTxSign(built, signer);
  assert.equal(signed.ok, true);

  // 3. broadcast
  const broadcast = await btcTxBroadcast(signed.result.txHex, netProvider);
  assert.equal(broadcast.ok, true);
  assert.ok(broadcast.txid, `txid: ${broadcast.txid}`);
});
