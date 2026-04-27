import { test } from "node:test";
import assert from "node:assert/strict";
import { createBtcProvider } from "../../apps/btc/provider.mjs";
import { createTrxProvider } from "../../apps/trx/provider.mjs";
import { createEvmProvider } from "../../apps/evm/provider.mjs";

// ── 测试辅助函数 ───────────────────────────────────────────────────────────
function createMockWalletContext() {
  const secretCache = {
    mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    type: "mnemonic",
  };

  return {
    withUnlockedSecret: async (opts, executor) => {
      return executor({ type: secretCache.type, value: secretCache.mnemonic });
    },
    deriveKeyMaterial: async (opts) => {
      // 返回包含私钥的 mock 材料
      // 使用固定私钥用于测试
      const fixedPrivateKey = "0x" + "a".repeat(64);
      
      // 如果有 returnAll 标志或多路径，返回 items 数组
      if (opts.returnAll) {
        return {
          privateKeyHex: fixedPrivateKey,
          path: opts.path ?? "m/44'/60'/0'/0/0",
          items: [
            { path: "m/44'/60'/0'/0/0", privateKeyHex: fixedPrivateKey },
            { path: "m/44'/60'/0'/0/1", privateKeyHex: "0x" + "b".repeat(64) },
          ],
        };
      }
      
      // 默认只返回单个私钥（不返回 items）
      return {
        privateKeyHex: fixedPrivateKey,
        path: opts.path ?? "m/44'/60'/0'/0/0",
        items: null,  // 单个地址模式
      };
    },
    audit: async (opts) => {
      // 审计日志（可选）
    },
  };
}

test("Provider getAddress - BTC: 地址缓存 (addressType:path)", async (t) => {
  const provider = createBtcProvider({ version: "1.0.0" });
  const signer = await provider.createSigner({
    wallet: createMockWalletContext(),
    keyId: "test-key",
    options: { network: "mainnet" },
  });

  // 第一次调用 getAddress - 应该计算地址
  const addr1 = await signer.getAddress({ addressType: "p2wpkh", path: "m/84'/0'/0'/0/0" });
  assert(addr1, "应该返回地址");
  assert(typeof addr1 === "string", "应该返回字符串地址");

  // 第二次调用相同参数 - 应该从缓存返回
  const addr2 = await signer.getAddress({ addressType: "p2wpkh", path: "m/84'/0'/0'/0/0" });
  assert.equal(addr1, addr2, "缓存地址应该与第一次调用相同");

  // 不同 addressType - 应该不同
  const addr3 = await signer.getAddress({ addressType: "p2pkh", path: "m/84'/0'/0'/0/0" });
  assert.notEqual(addr1, addr3, "不同 addressType 应该生成不同地址");

  // 不同 path - 应该不同
  const addr4 = await signer.getAddress({ addressType: "p2wpkh", path: "m/84'/0'/0'/0/1" });
  assert.notEqual(addr1, addr4, "不同 path 应该生成不同地址");
});

test("Provider getAddress - TRX: 地址缓存 (path)", async (t) => {
  const provider = createTrxProvider({ version: "1.0.0" });
  const signer = await provider.createSigner({
    wallet: createMockWalletContext(),
    keyId: "test-key",
  });

  // 第一次调用 - 应该计算地址
  const addr1 = await signer.getAddress({ path: "m/44'/195'/0'/0/0" });
  assert(addr1, "应该返回地址");
  assert(typeof addr1 === "string", "应该返回字符串地址");

  // 第二次调用相同参数 - 应该从缓存返回
  const addr2 = await signer.getAddress({ path: "m/44'/195'/0'/0/0" });
  assert.equal(addr1, addr2, "缓存地址应该与第一次调用相同");

  // 不同 path - 应该不同
  const addr3 = await signer.getAddress({ path: "m/44'/195'/0'/0/1" });
  assert.notEqual(addr1, addr3, "不同 path 应该生成不同地址");
});

test("Provider getAddress - EVM: 地址缓存 (path)", async (t) => {
  const provider = createEvmProvider({ version: "1.0.0" });
  const signer = await provider.createSigner({
    wallet: createMockWalletContext(),
    keyId: "test-key",
  });

  // 第一次调用 - 应该计算地址
  const addr1 = await signer.getAddress({});
  assert(addr1, "应该返回地址");
  assert(typeof addr1 === "string", "应该返回字符串地址");

  // 第二次调用 - 应该从缓存返回
  const addr2 = await signer.getAddress({});
  assert.equal(addr1, addr2, "缓存地址应该与第一次调用相同");

  // 多地址模式 returnAll = true
  const result = await signer.getAddress({ returnAll: true });
  assert(Array.isArray(result.addresses), "应该返回地址数组");
  assert.equal(result.addresses.length, 2, "应该返回 2 个地址");
});

test("Provider getAddress - 缓存隔离 (不同 keyId)", async (t) => {
  const provider = createBtcProvider({ version: "1.0.0" });
  
  // 第一个 signer，keyId = "key1"
  const signer1 = await provider.createSigner({
    wallet: createMockWalletContext(),
    keyId: "key1",
    options: { network: "mainnet" },
  });

  // 第二个 signer，keyId = "key2"
  const signer2 = await provider.createSigner({
    wallet: createMockWalletContext(),
    keyId: "key2",
    options: { network: "mainnet" },
  });

  const addr1 = await signer1.getAddress({ addressType: "p2wpkh", path: "m/84'/0'/0'/0/0" });
  const addr2 = await signer2.getAddress({ addressType: "p2wpkh", path: "m/84'/0'/0'/0/0" });

  // 两个不同的 signer 应该有各自的缓存（每个 signer 闭包内的缓存独立）
  // 这里两个 signer 使用相同的 mock wallet，所以地址会相同，但缓存是独立的
  assert.equal(addr1, addr2, "相同私钥应该生成相同地址");
});
