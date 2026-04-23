/**
 * BTC 地址派生回归测试
 *
 * 验证 provider.mjs 中 4 种地址类型（p2pkh / p2sh-p2wpkh / p2wpkh / p2tr）
 * 在 mainnet / testnet / regtest 下的派生结果与 test.key.md 向量完全一致。
 *
 * 使用 mock wallet（不需真实 key 文件），executor 直接注入测试助记词。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createBtcProvider } from "../../../apps/btc/provider.mjs";

// ── 测试助记词（来自 test.key.md 第一行）────────────────────────────────────────
const MNEMONIC =
  "side dog pig sausage retire trap voyage wool fox awake ripple defense remove bright palm unknown rail grocery embody recipe absurd rude boat useless";

// ── mock wallet：withUnlockedSecret 直接注入 secret，跳过真实解密 ────────────────
function makeMockWallet() {
  return {
    withUnlockedSecret: async (_input, executor) =>
      executor({ type: "mnemonic", value: MNEMONIC }),
    audit: async () => {},
  };
}

// ── helper：为给定网络创建 signer ─────────────────────────────────────────────
async function makeSigner(networkName) {
  const provider = createBtcProvider();
  const wallet = makeMockWallet();
  return provider.createSigner({
    wallet,
    keyId: "test-regression",
    options: { network: networkName },
  });
}

// ── 测试向量（来自 test.key.md）───────────────────────────────────────────────
const MAINNET_VECTORS = [
  { addressType: "p2pkh",       path: "m/44'/0'/0'/0/0", expected: "1Pv6K53HSbXVdjFPdL9PLUm46SiZZvwMKg" },
  { addressType: "p2pkh",       path: "m/44'/0'/0'/0/1", expected: "122LkK2GEaWMgtjE57b4G1izAT6K8sqBnX" },
  { addressType: "p2sh-p2wpkh", path: "m/49'/0'/0'/0/0", expected: "39vqbVsLHuFav7S74vagQo7TeGAzJH2rPG" },
  { addressType: "p2sh-p2wpkh", path: "m/49'/0'/0'/0/1", expected: "3G4SrWFjjTMAv1famnAST6pxuynSqZLbQc" },
  { addressType: "p2wpkh",      path: "m/84'/0'/0'/0/0", expected: "bc1qah24v94c3l0qm8e9l7a55y8r5zypx6nx53j88y" },
  { addressType: "p2wpkh",      path: "m/84'/0'/0'/0/1", expected: "bc1qujm2cvze6qy5hask4c3pcjj8kw52ggk2pd97cy" },
  { addressType: "p2tr",        path: "m/86'/0'/0'/0/0", expected: "bc1pypnf0zx2ql6jsvd876nek349y8n5gz3f8xa2qm205vxw4evc58nq88q739" },
  { addressType: "p2tr",        path: "m/86'/0'/0'/0/1", expected: "bc1pkqk8g6xrx9p5f7pes56qrhgus2tdupmh9cc0hycvgatddysj5pzsc0zdh9" },
];

const TESTNET_VECTORS = [
  { addressType: "p2pkh",       path: "m/44'/1'/0'/0/0", expected: "mst17ksxiY6Z5mHnnuBqUiZ2AQL3TiJH8P" },
  { addressType: "p2pkh",       path: "m/44'/1'/0'/0/1", expected: "ms8as5qTkKUNDkKFeg3a1VuWtMYNXPfGu2" },
  { addressType: "p2sh-p2wpkh", path: "m/49'/1'/0'/0/0", expected: "2N5ytgTQ84z2TQN9kEX2ydJsHjcy2qR6ad6" },
  { addressType: "p2sh-p2wpkh", path: "m/49'/1'/0'/0/1", expected: "2NB1ni469UUmJm17fv2F5EALG9pwPwCNrEW" },
  { addressType: "p2wpkh",      path: "m/84'/1'/0'/0/0", expected: "tb1qe38akah45pc230agwmzx5wawwxrs0v429hws9e" },
  { addressType: "p2wpkh",      path: "m/84'/1'/0'/0/1", expected: "tb1qaj7xjx360uzkd88kclp2pmv2qj0g6dkycv3spc" },
  { addressType: "p2tr",        path: "m/86'/1'/0'/0/0", expected: "tb1pk6qs37n2awsscuavqp2rmcpqlhpvzjfytp00nslhg8ql5cmdp7ws6pwhvv" },
  { addressType: "p2tr",        path: "m/86'/1'/0'/0/1", expected: "tb1pcwc7dnht3kvc2cseujcwdnrqutwjshfd8pp89lxtvtaf3g5uxuks5d77u8" },
];

// regtest p2pkh/p2sh-p2wpkh 与 testnet 相同（coinType=1），bech32 前缀不同
const REGTEST_VECTORS = [
  { addressType: "p2pkh",       path: "m/44'/1'/0'/0/0", expected: "mst17ksxiY6Z5mHnnuBqUiZ2AQL3TiJH8P" },
  { addressType: "p2pkh",       path: "m/44'/1'/0'/0/1", expected: "ms8as5qTkKUNDkKFeg3a1VuWtMYNXPfGu2" },
  { addressType: "p2sh-p2wpkh", path: "m/49'/1'/0'/0/0", expected: "2N5ytgTQ84z2TQN9kEX2ydJsHjcy2qR6ad6" },
  { addressType: "p2sh-p2wpkh", path: "m/49'/1'/0'/0/1", expected: "2NB1ni469UUmJm17fv2F5EALG9pwPwCNrEW" },
  { addressType: "p2wpkh",      path: "m/84'/1'/0'/0/0", expected: "bcrt1qe38akah45pc230agwmzx5wawwxrs0v4287hajs" },
  { addressType: "p2wpkh",      path: "m/84'/1'/0'/0/1", expected: "bcrt1qaj7xjx360uzkd88kclp2pmv2qj0g6dky69gak3" },
  { addressType: "p2tr",        path: "m/86'/1'/0'/0/0", expected: "bcrt1pk6qs37n2awsscuavqp2rmcpqlhpvzjfytp00nslhg8ql5cmdp7wshcy3ek" },
  { addressType: "p2tr",        path: "m/86'/1'/0'/0/1", expected: "bcrt1pcwc7dnht3kvc2cseujcwdnrqutwjshfd8pp89lxtvtaf3g5uxukse55cfa" },
];

// ── Mainnet ───────────────────────────────────────────────────────────────────
test("address-derive/mainnet: 8 个地址向量全部匹配", async (t) => {
  const signer = await makeSigner("mainnet");
  for (const { addressType, path, expected } of MAINNET_VECTORS) {
    await t.test(`mainnet ${addressType} ${path}`, async () => {
      const got = await signer.getAddress({ addressType, path });
      assert.equal(got, expected, `${addressType} @ ${path}: got ${got}`);
    });
  }
});

// ── Testnet ───────────────────────────────────────────────────────────────────
test("address-derive/testnet: 8 个地址向量全部匹配", async (t) => {
  const signer = await makeSigner("testnet");
  for (const { addressType, path, expected } of TESTNET_VECTORS) {
    await t.test(`testnet ${addressType} ${path}`, async () => {
      const got = await signer.getAddress({ addressType, path });
      assert.equal(got, expected, `${addressType} @ ${path}: got ${got}`);
    });
  }
});

// ── Regtest ───────────────────────────────────────────────────────────────────
test("address-derive/regtest: 8 个地址向量全部匹配", async (t) => {
  const signer = await makeSigner("regtest");
  for (const { addressType, path, expected } of REGTEST_VECTORS) {
    await t.test(`regtest ${addressType} ${path}`, async () => {
      const got = await signer.getAddress({ addressType, path });
      assert.equal(got, expected, `${addressType} @ ${path}: got ${got}`);
    });
  }
});

// ── defaultDerivationPath 路径验证 ───────────────────────────────────────────
test("address-derive/default-path: getAddress 无 path 参数时走默认路径", async (t) => {
  // 用 index=0 的向量验证默认路径
  const mainnetSigner = await makeSigner("mainnet");
  const testnetSigner = await makeSigner("testnet");

  await t.test("mainnet p2wpkh 默认路径", async () => {
    const got = await mainnetSigner.getAddress({ addressType: "p2wpkh" });
    assert.equal(got, "bc1qah24v94c3l0qm8e9l7a55y8r5zypx6nx53j88y");
  });

  await t.test("mainnet p2tr 默认路径", async () => {
    const got = await mainnetSigner.getAddress({ addressType: "p2tr" });
    assert.equal(got, "bc1pypnf0zx2ql6jsvd876nek349y8n5gz3f8xa2qm205vxw4evc58nq88q739");
  });

  await t.test("testnet p2tr 默认路径", async () => {
    const got = await testnetSigner.getAddress({ addressType: "p2tr" });
    assert.equal(got, "tb1pk6qs37n2awsscuavqp2rmcpqlhpvzjfytp00nslhg8ql5cmdp7ws6pwhvv");
  });
});
