import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { createWallet } from "../../apps/wallet/index.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wallet-core-"));
}

async function writeEncryptedKeyDoc(baseDir, relativeOutput, password, content) {
  const sourceDir = path.join(baseDir, "fixtures");
  const sourceFile = path.join(sourceDir, `${path.basename(relativeOutput)}.md`);
  const outputFile = path.join(baseDir, relativeOutput);

  await fs.mkdir(path.dirname(sourceFile), { recursive: true });
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(sourceFile, content, "utf8");

  await encryptPathToFile({
    inputPath: sourceFile,
    password,
    outputFile,
  });

  return outputFile;
}

test("wallet.loadKeyFile: 默认扫描 key 目录并登记 key 元信息", async () => {
  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(
    tmp,
    "key/main.enc.json",
    "wallet-pass-123",
    [
      "wallet-main",
      "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9",
      "",
      "wallet-backup",
      "5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password: "wallet-pass-123", tags: ["prod"] });

  assert.equal(loaded.ok, true);
  assert.equal(loaded.loaded, 2);
  assert.equal(loaded.addedKeyIds.length, 2);
  assert.deepEqual(loaded.files, ["key/main.enc.json"]);

  const listed = await wallet.listKeys();
  assert.equal(listed.total, 2);
  assert.equal(listed.items[0].status, "loaded");
  assert.deepEqual(listed.items[0].tags, ["prod"]);
});

test("wallet.loadKeyFile: 支持同时加载多个文件夹", async () => {
  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(
    tmp,
    "key/team-a/a.enc.json",
    "wallet-pass-123",
    [
      "wallet-a",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ].join("\n"),
  );
  await writeEncryptedKeyDoc(
    tmp,
    "more-keys/team-b/b.enc.json",
    "wallet-pass-123",
    [
      "wallet-b",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({
    password: "wallet-pass-123",
    dirs: ["key", "more-keys"],
  });

  assert.equal(loaded.loaded, 2);
  assert.equal(loaded.files.length, 2);

  const listed = await wallet.listKeys();
  assert.equal(listed.total, 2);
  assert.deepEqual(
    listed.items.map((item) => item.sourceFile).sort(),
    ["key/team-a/a.enc.json", "more-keys/team-b/b.enc.json"],
  );
});

test("wallet 前六个接口: getKeyMeta / unlock / lock / lockAll", async () => {
  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(
    tmp,
    "key/ops.enc.json",
    "wallet-pass-123",
    [
      "wallet-ops",
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password: "wallet-pass-123" });
  const keyId = loaded.addedKeyIds[0];

  const metaBeforeUnlock = await wallet.getKeyMeta({ keyId });
  assert.equal(metaBeforeUnlock.item.status, "loaded");
  assert.equal(metaBeforeUnlock.item.name, "wallet-ops");

  const unlocked = await wallet.unlock({
    keyId,
    password: "wallet-pass-123",
    ttlMs: 60_000,
    reason: "test",
    scope: {
      chain: "evm",
      contracts: ["0xabc"],
    },
  });

  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.keyId, keyId);
  assert.deepEqual(unlocked.scope, { chain: "evm", contracts: ["0xabc"] });
  assert.equal(Array.isArray(unlocked.tree?.tree), true);
  assert.equal(unlocked.tree?.action, "wallet.tree");
  assert.equal(unlocked.tree?.counts?.accounts, 1);

  const sessionState = await wallet.getSessionState({ keyId });
  assert.equal(Array.isArray(sessionState.tree?.tree), true);
  assert.equal(sessionState.tree?.action, "wallet.tree");

  const directTree = await wallet.getTree();
  assert.equal(directTree?.ok, true);
  assert.equal(directTree?.action, "wallet.tree");
  assert.equal(Array.isArray(directTree?.tree), true);
  assert.equal(directTree?.counts?.accounts, 1);

  const metaAfterUnlock = await wallet.getKeyMeta({ keyId });
  assert.equal(metaAfterUnlock.item.status, "unlocked");

  const lockResult = await wallet.lock({ keyId });
  assert.equal(lockResult.locked, true);
  assert.equal((await wallet.getKeyMeta({ keyId })).item.status, "loaded");

  await wallet.unlock({ keyId, password: "wallet-pass-123" });
  const lockAllResult = await wallet.lockAll();
  assert.equal(lockAllResult.ok, true);
  assert.equal(lockAllResult.count, 1);
  assert.equal((await wallet.getKeyMeta({ keyId })).item.status, "loaded");
});

test("wallet.unlock: 错误密码应拒绝解锁", async () => {
  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(
    tmp,
    "key/secure.enc.json",
    "wallet-pass-123",
    [
      "wallet-secure",
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password: "wallet-pass-123" });

  await assert.rejects(
    () => wallet.unlock({
      keyId: loaded.addedKeyIds[0],
      password: "wrong-pass",
    }),
    /key 解锁失败/i,
  );
});

test("wallet.loadDevKeys: 导入预定义的开发用密钥，无需密码", async () => {
  const tmp = await mkTmpDir();
  const wallet = createWallet({ baseDir: tmp });

  // 1. 加载所有 dev keys
  const devLoaded = await wallet.loadDevKeys();
  assert.equal(devLoaded.ok, true);
  assert.equal(devLoaded.loaded >= 3, true, "应该至少加载 3 个 dev keys");

  // 2. 列出所有 keys，验证 dev keys 已添加
  const listResult = await wallet.listKeys();
  assert.equal(listResult.ok, true);
  const devKeys = listResult.items.filter((item) => item.source === "dev");
  assert.equal(devKeys.length >= 3, true, "应该有至少 3 个 dev source 的 keys");

  // 3. 验证 dev key 包含预期的名称和标签
  const hardhatDefault = devKeys.find((item) => item.name === "hardhat-default");
  assert.ok(hardhatDefault, "应该有 hardhat-default key");
  assert.equal(hardhatDefault.type, "mnemonic");
  assert.ok(hardhatDefault.tags.includes("hardhat"), "应该包含 hardhat 标签");

  const account0 = devKeys.find((item) => item.name === "hardhat-account-0");
  assert.ok(account0, "应该有 hardhat-account-0 key");
  assert.equal(account0.type, "privateKey");

  // 4. 验证 dev key 无需密码即可解锁
  const unlockResult = await wallet.unlock({
    keyId: hardhatDefault.keyId,
    // 注意：不需要提供密码
  });
  assert.equal(unlockResult.ok, true);
  assert.equal(unlockResult.source, "dev");

  // 5. 验证可以通过 ttlMs 自定义过期时间
  await wallet.lock({ keyId: hardhatDefault.keyId });
  const unlockResult2 = await wallet.unlock({
    keyId: hardhatDefault.keyId,
    ttlMs: 5000,  // 5 秒过期
  });
  assert.ok(unlockResult2.expiresAt);

  // 6. 验证可以通过 names 选择性导入
  await wallet.lockAll();
  const wallet2 = createWallet({ baseDir: tmp });
  const partialDevLoaded = await wallet2.loadDevKeys({
    names: ["hardhat-default"],
    tags: ["test"],
  });
  assert.equal(partialDevLoaded.loaded, 1);

  const list2 = await wallet2.listKeys();
  const testTagKeys = list2.items.filter((item) => item.tags.includes("test"));
  assert.equal(testTagKeys.length, 1);
  assert.equal(testTagKeys[0].name, "hardhat-default");
});

test("wallet.getSessionState: 应返回 loaded/unlocked 状态切换", async () => {
  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(
    tmp,
    "key/state.enc.json",
    "wallet-pass-123",
    [
      "wallet-state",
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password: "wallet-pass-123" });
  const keyId = loaded.addedKeyIds[0];

  const stateBefore = await wallet.getSessionState({ keyId });
  assert.equal(stateBefore.ok, true);
  assert.equal(stateBefore.unlocked, false);

  await wallet.unlock({ keyId, password: "wallet-pass-123", ttlMs: 60_000 });
  const stateAfter = await wallet.getSessionState({ keyId });
  assert.equal(stateAfter.unlocked, true);
  assert.ok(stateAfter.unlockedAt);
  assert.ok(stateAfter.expiresAt);

  await wallet.lock({ keyId });
  const stateLocked = await wallet.getSessionState({ keyId });
  assert.equal(stateLocked.unlocked, false);
});

test("wallet provider registry: registerProvider/listChains/supports", async () => {
  const wallet = createWallet({ baseDir: await mkTmpDir() });

  const providerV1 = {
    chain: "evm",
    version: "1",
    operations: ["getAddress"],
    createSigner: () => ({ chain: "evm" }),
  };

  const reg1 = await wallet.registerProvider({ provider: providerV1 });
  assert.equal(reg1.ok, true);
  assert.equal(reg1.chain, "evm");
  assert.equal(reg1.replaced, false);

  const chains = await wallet.listChains();
  assert.equal(chains.ok, true);
  assert.equal(chains.items.length, 1);
  assert.equal(chains.items[0].chain, "evm");
  assert.deepEqual(chains.items[0].operations, ["getAddress"]);

  const supportsAddress = await wallet.supports({ chain: "evm", operation: "getAddress" });
  assert.equal(supportsAddress.supported, true);

  const supportsSign = await wallet.supports({ chain: "evm", operation: "signTransaction" });
  assert.equal(supportsSign.supported, false);

  await assert.rejects(
    () => wallet.registerProvider({ provider: providerV1 }),
    /provider 已存在/i,
  );

  const providerV2 = {
    ...providerV1,
    version: "2",
    operations: ["getAddress", "signMessage"],
  };
  const reg2 = await wallet.registerProvider({ provider: providerV2, allowOverride: true });
  assert.equal(reg2.replaced, true);

  const supportsMessage = await wallet.supports({ chain: "evm", operation: "signMessage" });
  assert.equal(supportsMessage.supported, true);
});

test("wallet.getSigner: 受 provider + session + capability 约束", async () => {
  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(
    tmp,
    "key/signer.enc.json",
    "wallet-pass-123",
    [
      "wallet-signer",
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password: "wallet-pass-123" });
  const keyId = loaded.addedKeyIds[0];

  await assert.rejects(
    () => wallet.getSigner({ chain: "evm", keyId }),
    /provider 未注册/i,
  );

  await wallet.registerProvider({
    provider: {
      chain: "evm",
      version: "1",
      operations: ["getAddress"],
      createSigner: ({ wallet: walletContext, keyId: signerKeyId }) => ({
        chain: "evm",
        keyId: signerKeyId,
        async getAddress() {
          return walletContext.withUnlockedSecret(
            { keyId: signerKeyId, chain: "evm", operation: "getAddress" },
            async (secret) => `0x${String(secret.value).slice(0, 8)}`,
          );
        },
        async signMessage() {
          return walletContext.withUnlockedSecret(
            { keyId: signerKeyId, chain: "evm", operation: "signMessage" },
            async () => "should-not-pass",
          );
        },
      }),
    },
  });

  await assert.rejects(
    async () => {
      const signerRes = await wallet.getSigner({ chain: "evm", keyId });
      await signerRes.signer.getAddress();
    },
    /未解锁|会话已过期/i,
  );

  await wallet.unlock({
    keyId,
    password: "wallet-pass-123",
    scope: { chain: "evm" },
    ttlMs: 60_000,
  });

  const signerRes = await wallet.getSigner({ chain: "evm", keyId });
  assert.equal(signerRes.ok, true);
  const address = await signerRes.signer.getAddress();
  assert.equal(typeof address, "string");
  assert.ok(address.startsWith("0x"));

  await assert.rejects(
    () => signerRes.signer.signMessage(),
    /operation 不支持/i,
  );
});

test("wallet.getTree: 按 chains 补地址并回写缓存，避免重复结算", async () => {
  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(
    tmp,
    "key/tree-cache.enc.json",
    "wallet-pass-123",
    [
      "wallet-tree-cache",
      "1111111111111111111111111111111111111111111111111111111111111111",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password: "wallet-pass-123" });
  const keyId = loaded.addedKeyIds[0];

  let getAddressCalls = 0;
  await wallet.registerProvider({
    provider: {
      chain: "evm",
      version: "1",
      operations: ["getAddress"],
      createSigner: ({ keyId: signerKeyId }) => ({
        async getAddress() {
          getAddressCalls += 1;
          return `0x${String(signerKeyId).slice(0, 40).padEnd(40, "0")}`;
        },
      }),
    },
  });

  await wallet.unlock({
    keyId,
    password: "wallet-pass-123",
    ttlMs: 60_000,
  });

  const firstTree = await wallet.getTree({ chains: ["evm"] });
  assert.equal(firstTree.ok, true);
  const firstRows = Array.isArray(firstTree.tree) ? firstTree.tree : [];
  const firstDeriveRows = firstRows.filter((row) => row.keyId === keyId && row.sourceType === "derive");
  assert.ok(firstDeriveRows.length > 0);
  assert.ok(firstDeriveRows.some((row) => String(row?.addresses?.evm ?? "").startsWith("0x")));
  assert.equal(getAddressCalls, 1);

  const secondTree = await wallet.getTree({ chains: ["evm"] });
  assert.equal(secondTree.ok, true);
  assert.equal(getAddressCalls, 1);
});