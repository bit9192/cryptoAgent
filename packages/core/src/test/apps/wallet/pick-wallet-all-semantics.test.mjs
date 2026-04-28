import test from "node:test";
import assert from "node:assert/strict";

import { createPickWalletOps } from "../../../apps/wallet/pick-wallet.mjs";

test("pickWallet: chains=all 在非 derive key 上展开全部链能力", async () => {
  const calls = [];
  const ops = createPickWalletOps({
    getAddressTypes: async (input = {}) => {
      if (input?.chain) {
        if (input.chain === "btc") {
          return { ok: true, chain: "btc", addressTypes: ["p2wpkh", "p2tr"] };
        }
        if (input.chain === "evm") {
          return { ok: true, chain: "evm", addressTypes: ["default"] };
        }
        if (input.chain === "trx") {
          return { ok: true, chain: "trx", addressTypes: ["default"] };
        }
      }
      return {
        ok: true,
        items: [
          { chain: "evm", addressTypes: ["default"] },
          { chain: "trx", addressTypes: ["default"] },
          { chain: "btc", addressTypes: ["p2wpkh", "p2tr"] },
        ],
      };
    },
    getSigner: async ({ chain }) => ({
      async getAddress(options = {}) {
        calls.push({ chain, options });
        if (chain === "btc") {
          return `${options.addressType}:${options.path ?? "default"}`;
        }
        return `${chain}:${options.path ?? "default"}`;
      },
    }),
  });

  const tree = {
    tree: [
      {
        keyId: "k1",
        name: "name-1",
        sourceName: "src-1",
        keyType: "private",
        sourceType: "import",
        path: "m/44'/0'/0'/0/3",
        addresses: {},
      },
    ],
  };

  const result = await ops.pickWallet(
    {
      scope: "all",
      selectors: { keyId: "k1" },
      outps: { chains: "all" },
    },
    tree,
  );

  assert.equal(result.length, 1);
  const addresses = result[0].addresses;
  assert.equal(typeof addresses.evm, "string");
  assert.equal(typeof addresses.trx, "string");
  assert.ok(Array.isArray(addresses.btc));
  assert.deepEqual(addresses.btc.map((v) => v.type), ["p2wpkh", "p2tr"]);

  // evm/trx 的 default 走非 typed 分支
  const evmCall = calls.find((c) => c.chain === "evm");
  const trxCall = calls.find((c) => c.chain === "trx");
  assert.ok(evmCall);
  assert.ok(trxCall);
  assert.deepEqual(evmCall.options, { path: "m/44'/0'/0'/0/3" });
  assert.deepEqual(trxCall.options, { path: "m/44'/0'/0'/0/3" });
});

test("pickWallet: chains=default 只返回 tree 上已有地址", async () => {
  const calls = [];
  const ops = createPickWalletOps({
    getAddressTypes: async (input = {}) => {
      if (input?.chain === "btc") {
        return { ok: true, chain: "btc", addressTypes: ["p2wpkh", "p2tr"] };
      }
      return {
        ok: true,
        items: [
          { chain: "evm", addressTypes: ["default"] },
          { chain: "trx", addressTypes: ["default"] },
          { chain: "btc", addressTypes: ["p2wpkh", "p2tr"] },
        ],
      };
    },
    getSigner: async ({ chain }) => ({
      async getAddress(options = {}) {
        calls.push({ chain, options });
        return `${chain}:${options.addressType ?? "default"}`;
      },
    }),
  });

  const tree = {
    tree: [
      {
        keyId: "k1",
        name: "name-1",
        sourceName: "src-1",
        keyType: "private",
        sourceType: "derive",
        path: "m/44'/60'/0'/0/9",
        addresses: {
          evm: "0xabc",
        },
      },
    ],
  };

  const result = await ops.pickWallet(
    {
      scope: "all",
      selectors: { keyId: "k1" },
      outps: { chains: "default" },
    },
    tree,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].addresses.evm, "0xabc");
  assert.equal(result[0].addresses.trx, undefined);
  assert.equal(result[0].addresses.btc, undefined);

  const defaultCalls = calls.filter((c) => c.chain === "evm" || c.chain === "trx");
  assert.equal(defaultCalls.length, 0);
  const btcCalls = calls.filter((c) => c.chain === "btc");
  assert.equal(btcCalls.length, 0);
});

test("pickWallet: 显式链数组 default 模式会生成地址", async () => {
  const calls = [];
  const ops = createPickWalletOps({
    getSigner: async ({ chain }) => ({
      async getAddress(options = {}) {
        calls.push({ chain, options });
        return `${chain}:${options.path ?? "default"}`;
      },
    }),
  });

  const tree = {
    tree: [
      {
        keyId: "k1",
        name: "name-1",
        sourceName: "src-1",
        keyType: "private",
        sourceType: "derive",
        path: "m/44'/60'/0'/0/9",
        addresses: {},
      },
    ],
  };

  const result = await ops.pickWallet(
    {
      scope: "all",
      selectors: { keyId: "k1" },
      outps: { chains: ["evm", "trx"] },
    },
    tree,
  );

  assert.equal(result.length, 1);
  assert.equal(typeof result[0].addresses.evm, "string");
  assert.equal(typeof result[0].addresses.trx, "string");
  const defaultCalls = calls.filter((c) => c.chain === "evm" || c.chain === "trx");
  assert.equal(defaultCalls.length, 2);
});

test("pickWallet: chains=all 在 derive key 上仍生成全部链能力", async () => {
  const calls = [];
  const ops = createPickWalletOps({
    getAddressTypes: async () => ({
      ok: true,
      items: [
        { chain: "evm", addressTypes: ["default"] },
        { chain: "trx", addressTypes: ["default"] },
        { chain: "btc", addressTypes: ["p2wpkh", "p2tr"] },
      ],
    }),
    getSigner: async ({ chain }) => ({
      async getAddress(options = {}) {
        calls.push({ chain, options });
        if (chain === "btc") {
          return `${options.addressType}:${options.path ?? "default"}`;
        }
        return `${chain}:${options.path ?? "default"}`;
      },
    }),
  });

  const tree = {
    tree: [
      {
        keyId: "k1",
        name: "name-1",
        sourceName: "src-1",
        keyType: "private",
        sourceType: "derive",
        path: "m/44'/60'/0'/0/9",
        addresses: {},
      },
    ],
  };

  const result = await ops.pickWallet(
    {
      scope: "all",
      selectors: { keyId: "k1" },
      outps: { chains: "all" },
    },
    tree,
  );

  assert.equal(typeof result[0].addresses.evm, "string");
  assert.equal(typeof result[0].addresses.trx, "string");
  assert.ok(Array.isArray(result[0].addresses.btc));
  const defaultCalls = calls.filter((c) => c.chain === "evm" || c.chain === "trx");
  assert.equal(defaultCalls.length, 2);
});

test("pickWallet: 单链 addressTypes=all 展开全类型", async () => {
  const calls = [];
  const ops = createPickWalletOps({
    getAddressTypes: async (input = {}) => {
      if (input?.chain === "btc") {
        return { ok: true, chain: "btc", addressTypes: ["p2wpkh", "p2tr"] };
      }
      return { ok: true, items: [] };
    },
    getSigner: async ({ chain }) => ({
      async getAddress(options = {}) {
        calls.push({ chain, options });
        return `${options.addressType}:${options.path ?? "default"}`;
      },
    }),
  });

  const tree = {
    tree: [
      {
        keyId: "k1",
        name: "name-1",
        sourceName: "src-1",
        keyType: "private",
        sourceType: "derive",
        path: "m/84'/0'/0'/0/9",
        addresses: {},
      },
    ],
  };

  const result = await ops.pickWallet(
    {
      scope: "all",
      selectors: { keyId: "k1" },
      outps: {
        chains: [{ chain: "btc", addressTypes: "all" }],
      },
    },
    tree,
  );

  assert.equal(result.length, 1);
  assert.ok(Array.isArray(result[0].addresses.btc));
  assert.deepEqual(result[0].addresses.btc.map((v) => v.type), ["p2wpkh", "p2tr"]);

  const btcCalls = calls.filter((c) => c.chain === "btc");
  assert.equal(btcCalls.length, 2);
  assert.deepEqual(btcCalls[0].options, { addressType: "p2wpkh", path: "m/84'/0'/0'/0/9" });
  assert.deepEqual(btcCalls[1].options, { addressType: "p2tr", path: "m/84'/0'/0'/0/9" });
});
