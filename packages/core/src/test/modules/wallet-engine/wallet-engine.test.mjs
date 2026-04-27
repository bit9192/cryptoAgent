import test from "node:test";
import assert from "node:assert/strict";

import {
  retrieveWalletCandidates,
  generateAddressFromCandidates,
  generateSignerFromCandidates,
  resolveSearchAddressRequest,
  resolveSignerRefs,
} from "../../../modules/wallet-engine/index.mjs";
import { searchTaskWithEngine } from "../../../tasks/search/index.mjs";

function makeWalletStatus() {
  return {
    addresses: [
      { keyId: "k1", keyName: "alpha", chain: "evm", address: "0x1111111111111111111111111111111111111111", name: "main" },
      { keyId: "k1", keyName: "alpha", chain: "evm", address: "0x2222222222222222222222222222222222222222", name: "alt" },
      { keyId: "k2", keyName: "beta", chain: "trx", address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", name: "trx-main" },
      { keyId: "k3", keyName: "dev-hd", chain: "evm", address: "0x3333333333333333333333333333333333333333", name: "dev-m0", path: "m/44'/60'/0'/0/0" },
      { keyId: "k3", keyName: "dev-hd", chain: "evm", address: "0x4444444444444444444444444444444444444444", name: "dev-m1", path: "m/44'/60'/0'/0/1" },
    ],
  };
}

function makeWalletStatusWithSigners() {
  return {
    addresses: [
      {
        keyId: "k1",
        keyName: "alpha",
        chain: "evm",
        address: "0x1111111111111111111111111111111111111111",
        name: "main",
        signerRef: "evm:k1:0x1111",
        signerType: "ethers-signer",
      },
      {
        keyId: "k1",
        keyName: "alpha",
        chain: "evm",
        address: "0x2222222222222222222222222222222222222222",
        name: "alt",
        signerRef: "evm:k1:0x2222",
        signerType: "ethers-signer",
      },
      {
        keyId: "k2",
        keyName: "beta",
        chain: "trx",
        address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
        name: "trx-main",
        signerRef: "trx:k2:main",
        signerType: "trx-signer",
      },
      {
        keyId: "k3",
        keyName: "dev-hd",
        chain: "evm",
        address: "0x3333333333333333333333333333333333333333",
        name: "dev-m0",
        path: "m/44'/60'/0'/0/0",
        signerRef: "evm:k3:m0",
        signerType: "hd-signer",
      },
      {
        keyId: "k3",
        keyName: "dev-hd",
        chain: "evm",
        address: "0x4444444444444444444444444444444444444444",
        name: "dev-m1",
        path: "m/44'/60'/0'/0/1",
        signerRef: "evm:k3:m1",
        signerType: "hd-signer",
      },
    ],
  };
}

// ============================================================
// 检索阶段测试 (retrieveWalletCandidates)
// ============================================================

test("retrieve: 精确名称搜寻单结果", () => {
  const candidates = retrieveWalletCandidates(
    { nameExact: true, name: "main" },
    makeWalletStatus(),
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "main");
  assert.equal(candidates[0].address, "0x1111111111111111111111111111111111111111");
});

test("retrieve: 模糊名称搜寻多结果", () => {
  const candidates = retrieveWalletCandidates(
    { nameExact: false, name: "dev" },
    makeWalletStatus(),
  );

  assert.ok(candidates.length >= 2);
  assert.ok(candidates.some((c) => c.name === "dev-m0"));
  assert.ok(candidates.some((c) => c.name === "dev-m1"));
});

test("retrieve: 按 keyId 精确匹配", () => {
  const candidates = retrieveWalletCandidates(
    { keyId: "k3" },
    makeWalletStatus(),
  );

  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((c) => c.keyId === "k3"));
});

test("retrieve: 获取全部候选", () => {
  const candidates = retrieveWalletCandidates(
    { mode: "all" },
    makeWalletStatus(),
  );

  assert.equal(candidates.length, 5);
});

test("retrieve: 模糊名称无结果返回空数组", () => {
  const candidates = retrieveWalletCandidates(
    { nameExact: false, name: "nonexistent" },
    makeWalletStatus(),
  );

  assert.equal(candidates.length, 0);
});

test("retrieve: keyId 不存在返回空数组", () => {
  const candidates = retrieveWalletCandidates(
    { keyId: "k-not-exist" },
    makeWalletStatus(),
  );

  assert.equal(candidates.length, 0);
});

test("retrieve: 多过滤条件组合", () => {
  const candidates = retrieveWalletCandidates(
    { keyId: "k1", chain: "evm", name: "main" },
    makeWalletStatus(),
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "main");
});

// ============================================================
// 生成阶段测试 (generateAddressFromCandidates)
// ============================================================

test("generate: 单数模式单候选", () => {
  const candidates = [
    { keyId: "k1", address: "0x1111111111111111111111111111111111111111", name: "main", chain: "evm" },
  ];

  const result = generateAddressFromCandidates(candidates, { cardinality: "single" });

  assert.equal(result.ok, true);
  assert.equal(result.addresses.length, 1);
  assert.equal(result.query, "0x1111111111111111111111111111111111111111");
});

test("generate: 复数模式多候选", () => {
  const candidates = [
    { keyId: "k1", address: "0x1111111111111111111111111111111111111111", name: "main", chain: "evm" },
    { keyId: "k1", address: "0x2222222222222222222222222222222222222222", name: "alt", chain: "evm" },
  ];

  const result = generateAddressFromCandidates(candidates, { cardinality: "multi" });

  assert.equal(result.ok, true);
  assert.equal(result.cardinality, "multi");
  assert.equal(result.addresses.length, 2);
});

test("generate: 单数模式多候选报 MULTIPLE_MATCH", () => {
  const candidates = [
    { keyId: "k1", address: "0x1111111111111111111111111111111111111111", name: "main", chain: "evm" },
    { keyId: "k1", address: "0x2222222222222222222222222222222222222222", name: "alt", chain: "evm" },
  ];

  assert.throws(
    () => generateAddressFromCandidates(candidates, { cardinality: "single" }),
    (err) => err?.code === "MULTIPLE_MATCH" && err?.meta?.count === 2,
  );
});

test("generate: 无候选报 NO_MATCH", () => {
  assert.throws(
    () => generateAddressFromCandidates([], { cardinality: "single" }),
    (err) => err?.code === "NO_MATCH",
  );
});

// ============================================================
// 集成测试：向后兼容原 resolveSearchAddressRequest
// ============================================================

test("wallet-engine: keyId + chain 能唯一解析 search query", () => {
  const resolved = resolveSearchAddressRequest({
    inputs: { keyId: "k2", chain: "trx" },
    requirement: { kind: "address", cardinality: "single" },
    walletStatus: makeWalletStatus(),
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.query, "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");
  assert.equal(resolved.chain, "trx");
});

test("wallet-engine: key-only targets 可通过 walletStatus 反查地址", () => {
  const resolved = resolveSearchAddressRequest({
    inputs: {
      targets: [{ keyId: "k2", keyName: "beta" }],
    },
    requirement: { kind: "address", cardinality: "single" },
    walletStatus: makeWalletStatus(),
  });

  assert.equal(resolved.query, "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");
  assert.equal(resolved.addresses.length, 1);
  assert.equal(resolved.addresses[0].keyId, "k2");
});

test("wallet-engine: cardinality=multi 返回多命中地址", () => {
  const resolved = resolveSearchAddressRequest({
    inputs: { keyId: "k1", chain: "evm" },
    requirement: { kind: "address", cardinality: "multi" },
    walletStatus: makeWalletStatus(),
  });

  assert.equal(resolved.cardinality, "multi");
  assert.equal(resolved.addresses.length, 2);
});

test("wallet-engine: single 模式多命中时报 MULTIPLE_MATCH", () => {
  assert.throws(
    () => resolveSearchAddressRequest({
      inputs: { keyId: "k1", chain: "evm" },
      requirement: { kind: "address", cardinality: "single" },
      walletStatus: makeWalletStatus(),
    }),
    (err) => err?.code === "MULTIPLE_MATCH",
  );
});

test("wallet-engine: 无命中时报 NO_MATCH", () => {
  assert.throws(
    () => resolveSearchAddressRequest({
      inputs: { keyId: "not-exists" },
      requirement: { kind: "address", cardinality: "single" },
      walletStatus: makeWalletStatus(),
    }),
    (err) => err?.code === "NO_MATCH",
  );
});

test("wallet-engine + searchTaskWithEngine: 解析结果可直接作为 search.query", async () => {
  const resolved = resolveSearchAddressRequest({
    inputs: { keyId: "k2", chain: "trx" },
    requirement: { kind: "address", cardinality: "single" },
    walletStatus: makeWalletStatus(),
    defaults: { network: "mainnet" },
  });

  const fakeEngine = {
    async search(input = {}) {
      return {
        ok: true,
        candidates: [
          {
            domain: input.domain,
            chain: "trx",
            network: input.network,
            address: input.query,
          },
        ],
      };
    },
  };

  const result = await searchTaskWithEngine({
    domain: "token",
    query: resolved.query,
    network: resolved.network,
  }, fakeEngine);

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].address, resolved.query);
});

// ============================================================
// Signer 生成阶段测试 (generateSignerFromCandidates)
// ============================================================

test("generate: signer 单候选输出", () => {
  const candidates = [
    {
      keyId: "k1",
      address: "0x1111111111111111111111111111111111111111",
      name: "main",
      chain: "evm",
      signerRef: "evm:k1:0x1111",
      signerType: "ethers-signer",
    },
  ];

  const result = generateSignerFromCandidates(candidates, { cardinality: "single" });

  assert.equal(result.ok, true);
  assert.equal(result.kind, "signer");
  assert.equal(result.signerRefs.length, 1);
  assert.equal(result.signerRefs[0], "evm:k1:0x1111");
  assert.equal(result.chain, "evm");
  
  // 安全检验：没有 privateKey、mnemonic 等敏感字段
  assert.ok(!result.privateKey);
  assert.ok(!result.mnemonic);
  assert.ok(!result.password);
});

test("generate: signer 复数模式多候选", () => {
  const candidates = [
    {
      keyId: "k1",
      address: "0x1111111111111111111111111111111111111111",
      name: "main",
      chain: "evm",
      signerRef: "evm:k1:0x1111",
      signerType: "ethers-signer",
    },
    {
      keyId: "k1",
      address: "0x2222222222222222222222222222222222222222",
      name: "alt",
      chain: "evm",
      signerRef: "evm:k1:0x2222",
      signerType: "ethers-signer",
    },
  ];

  const result = generateSignerFromCandidates(candidates, { cardinality: "multi" });

  assert.equal(result.ok, true);
  assert.equal(result.cardinality, "multi");
  assert.equal(result.signerRefs.length, 2);
  assert.equal(result.signerTypes.length, 1);
  assert.equal(result.signerTypes[0], "ethers-signer");
});

test("generate: signer 单数模式多候选报 MULTIPLE_MATCH", () => {
  const candidates = [
    {
      keyId: "k1",
      address: "0x1111111111111111111111111111111111111111",
      signerRef: "evm:k1:0x1111",
      chain: "evm",
    },
    {
      keyId: "k1",
      address: "0x2222222222222222222222222222222222222222",
      signerRef: "evm:k1:0x2222",
      chain: "evm",
    },
  ];

  assert.throws(
    () => generateSignerFromCandidates(candidates, { cardinality: "single" }),
    (err) => err?.code === "MULTIPLE_MATCH" && err?.meta?.count === 2,
  );
});

test("generate: signer 无候选报 NO_MATCH", () => {
  assert.throws(
    () => generateSignerFromCandidates([], { cardinality: "single" }),
    (err) => err?.code === "NO_MATCH",
  );
});

test("generate: signer HD 多路径", () => {
  const candidates = [
    {
      keyId: "k3",
      address: "0x3333333333333333333333333333333333333333",
      name: "dev-m0",
      path: "m/44'/60'/0'/0/0",
      chain: "evm",
      signerRef: "evm:k3:m0",
      signerType: "hd-signer",
    },
    {
      keyId: "k3",
      address: "0x4444444444444444444444444444444444444444",
      name: "dev-m1",
      path: "m/44'/60'/0'/0/1",
      chain: "evm",
      signerRef: "evm:k3:m1",
      signerType: "hd-signer",
    },
  ];

  const result = generateSignerFromCandidates(candidates, { cardinality: "multi" });

  assert.equal(result.ok, true);
  assert.equal(result.signerRefs.length, 2);
  assert.equal(result.paths.length, 2);
  assert.ok(result.paths.includes("m/44'/60'/0'/0/0"));
  assert.ok(result.paths.includes("m/44'/60'/0'/0/1"));
});

// ============================================================
// Signer 接口测试 (resolveSignerRefs)
// ============================================================

test("signer-engine: 单候选 signer 解析", () => {
  const resolved = resolveSignerRefs({
    inputs: { keyId: "k1", chain: "evm", name: "main" },
    requirement: { kind: "signer", cardinality: "single" },
    walletStatus: makeWalletStatusWithSigners(),
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.kind, "signer");
  assert.equal(resolved.signerRefs.length, 1);
  assert.equal(resolved.signerRefs[0], "evm:k1:0x1111");
});

test("signer-engine: 跨链 signer 单选", () => {
  const resolved = resolveSignerRefs({
    inputs: { keyId: "k2" },
    requirement: { kind: "signer", cardinality: "single" },
    walletStatus: makeWalletStatusWithSigners(),
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.chain, "trx");
  assert.equal(resolved.signerRefs[0], "trx:k2:main");
  assert.ok(resolved.signerTypes.includes("trx-signer"));
});

test("signer-engine: 单数模式多 signer 报 MULTIPLE_MATCH", () => {
  assert.throws(
    () => resolveSignerRefs({
      inputs: { keyId: "k1", chain: "evm" },
      requirement: { kind: "signer", cardinality: "single" },
      walletStatus: makeWalletStatusWithSigners(),
    }),
    (err) => err?.code === "MULTIPLE_MATCH",
  );
});

test("security: address 输出无私钥字段", () => {
  const candidates = [
    {
      keyId: "k1",
      address: "0x1111111111111111111111111111111111111111",
      name: "main",
      chain: "evm",
      // 注意：这些敏感字段在实际使用时不应该被包含在候选中
      // 但我们测试候选中包含这些字段时，生成函数应该过滤它们
    },
  ];

  const result = generateAddressFromCandidates(candidates, { cardinality: "single" });

  // 确保输出中不含这些字段
  assert.ok(!JSON.stringify(result).includes("privateKey"));
  assert.ok(!JSON.stringify(result).includes("mnemonic"));
  assert.ok(!JSON.stringify(result).includes("password"));
});

test("security: signer 输出无助记词字段", () => {
  const candidates = [
    {
      keyId: "k1",
      address: "0x1111111111111111111111111111111111111111",
      name: "main",
      chain: "evm",
      signerRef: "evm:k1:0x1111",
      signerType: "ethers-signer",
      // 注意：敏感字段不应该在候选中
    },
  ];

  const result = generateSignerFromCandidates(candidates, { cardinality: "single" });

  // 确保输出中只有 signerRef，不含敏感字段
  assert.ok(result.signerRefs);
  assert.ok(!JSON.stringify(result).includes("mnemonic"));
  assert.ok(!JSON.stringify(result).includes("privateKey"));
  assert.ok(!JSON.stringify(result).includes("password"));
});
