import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { createDefaultWallet } from "../../apps/default-wallet.mjs";
import { createWallet } from "../../apps/wallet/index.mjs";
import { createBtcProvider } from "../../apps/btc/provider.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wallet-address-config-"));
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

test("wallet.deriveConfiguredAddresses: 按 @address-config 批量派生 BTC 地址", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";

  await writeEncryptedKeyDoc(
    tmp,
    "key/address-config.enc.json",
    password,
    [
      "wallet-btc-config",
      mnemonic,
      "@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/1 name=btc-main",
      "@address-config chain=btc type=p2tr path=m/86'/0'/0'/0/[0,1] name=btc-tap",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const result = await wallet.deriveConfiguredAddresses({ keyId });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].keyName, "wallet-btc-config");
  assert.ok(result.items.every((item) => item.chain === "btc"));
  assert.ok(result.items.every((item) => typeof item.address === "string" && item.address.length > 10));
  assert.ok(Array.isArray(result.warnings));
});

test("wallet.deriveConfiguredAddresses: BTC type/path 不匹配时 non-strict 给 warning，strict 抛错", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";

  await writeEncryptedKeyDoc(
    tmp,
    "key/address-config-mismatch.enc.json",
    password,
    [
      "wallet-btc-mismatch",
      mnemonic,
      "@address-config chain=btc type=p2wpkh path=m/49'/0'/0'/0/0 name=bad-purpose",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const loose = await wallet.deriveConfiguredAddresses({ keyId, strict: false });
  assert.equal(loose.ok, true);
  assert.ok(loose.warnings.some((item) => item.includes("type/path 不匹配")));
  assert.equal(loose.items.length, 1);

  await assert.rejects(
    () => wallet.deriveConfiguredAddresses({ keyId, strict: true }),
    /type\/path 不匹配/i,
  );
});

test("wallet.deriveConfiguredAddresses: 不传 keyId 时批量导出已解锁且有配置的 key", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";
  const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02d5d8f3e1f2c3d";
  const privateKeyNoConfig = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

  await writeEncryptedKeyDoc(
    tmp,
    "key/address-config-batch.enc.json",
    password,
    [
      "wallet-btc-mn",
      mnemonic,
      "@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/1 name=mn-1",
      "",
      "wallet-btc-pk",
      privateKey,
      "@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/7 name=pk-a",
      "@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/99 name=pk-b",
      "",
      "wallet-no-config",
      privateKeyNoConfig,
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  await wallet.loadKeyFile({ password });
  const listed = await wallet.listKeys();

  const mnemonicMeta = listed.items.find((item) => item.name === "wallet-btc-mn");
  const privateKeyMeta = listed.items.find((item) => item.name === "wallet-btc-pk");
  const noConfigMeta = listed.items.find((item) => item.name === "wallet-no-config");

  assert.ok(mnemonicMeta?.keyId);
  assert.ok(privateKeyMeta?.keyId);
  assert.ok(noConfigMeta?.keyId);

  await wallet.unlock({ keyId: mnemonicMeta.keyId, password, scope: { chain: "btc" } });
  await wallet.unlock({ keyId: privateKeyMeta.keyId, password, scope: { chain: "btc" } });
  await wallet.unlock({ keyId: noConfigMeta.keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const batch = await wallet.deriveConfiguredAddresses({});
  assert.equal(batch.ok, true);
  assert.equal(batch.keyId, null);
  assert.equal(Array.isArray(batch.results), true);
  assert.equal(batch.results.length, 2);
  assert.equal(batch.items.length, 2);

  const privateItems = batch.items.filter((item) => item.keyName === "wallet-btc-pk");
  assert.equal(privateItems.length, 1);
  assert.equal(privateItems[0].addressType, "p2wpkh");
  assert.equal(privateItems[0].path, null);

  const hasNoConfig = batch.items.some((item) => item.keyName === "wallet-no-config");
  assert.equal(hasNoConfig, false);
});

test("wallet.deriveConfiguredAddresses: 助记词规则未配置 path 时自动补默认路径", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";

  await writeEncryptedKeyDoc(
    tmp,
    "key/address-config-no-path.enc.json",
    password,
    [
      "wallet-btc-no-path",
      mnemonic,
      "@address-config chain=btc type=p2wpkh name=auto-path",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const result = await wallet.deriveConfiguredAddresses({ keyId });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].addressType, "p2wpkh");
  assert.equal(result.items[0].path, "m/84'/0'/0'/0/0");
  assert.ok(typeof result.items[0].address === "string" && result.items[0].address.length > 10);
});

test("wallet.deriveConfiguredAddresses: 支持多段 m/* 自动匹配默认派生路径", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";

  await writeEncryptedKeyDoc(
    tmp,
    "key/address-config-wild-purpose.enc.json",
    password,
    [
      "wallet-btc-auto-purpose",
      mnemonic,
      "@address-config chain=btc type=p2sh-p2wpkh path=m/*'/*'/*'/0/9 name=auto-purpose",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const result = await wallet.deriveConfiguredAddresses({ keyId });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].addressType, "p2sh-p2wpkh");
  assert.equal(result.items[0].path, "m/49'/0'/0'/0/9");
  assert.ok(typeof result.items[0].address === "string" && result.items[0].address.length > 10);
});

test("wallet.deriveConfiguredAddresses: 支持多段 * 与范围路径组合展开", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";

  await writeEncryptedKeyDoc(
    tmp,
    "key/address-config-wild-range.enc.json",
    password,
    [
      "wallet-btc-auto-range",
      mnemonic,
      "@address-config chain=btc type=p2sh-p2wpkh path=m/*'/*'/*'/0/[1,3] name=auto-range",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const result = await wallet.deriveConfiguredAddresses({ keyId });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  assert.deepEqual(
    result.items.map((item) => item.path),
    [
      "m/49'/0'/0'/0/1",
      "m/49'/0'/0'/0/2",
      "m/49'/0'/0'/0/3",
    ],
  );
  assert.deepEqual(
    result.items.map((item) => item.name),
    ["auto-range-1", "auto-range-2", "auto-range-3"],
  );
  assert.ok(result.items.every((item) => typeof item.address === "string" && item.address.length > 10));
});

test("wallet.deriveConfiguredAddresses: EVM 助记词支持多段 * 自动匹配", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";

  await writeEncryptedKeyDoc(
    tmp,
    "key/address-config-evm-wild.enc.json",
    password,
    [
      "wallet-evm-auto-path",
      mnemonic,
      "@address-config chain=evm path=m/*'/*'/*'/0/7 name=evm-auto-path",
    ].join("\n"),
  );

  const wallet = await createDefaultWallet({
    wallet: { baseDir: tmp },
  });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "evm" } });

  const result = await wallet.deriveConfiguredAddresses({ keyId });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].chain, "evm");
  assert.equal(result.items[0].path, "m/44'/60'/0'/0/7");
  assert.match(result.items[0].address, /^0x[0-9a-fA-F]{40}$/);
});

test("wallet.deriveConfiguredAddresses: 支持单条规则多 chain 派生", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";

  await writeEncryptedKeyDoc(
    tmp,
    "key/address-config-multi-chain.enc.json",
    password,
    [
      "wallet-multi-chain",
      mnemonic,
      "@address-config chain=evm,btc type=p2wpkh path=m/*'/*'/*'/0/1 name=multi-{chain}",
    ].join("\n"),
  );

  const wallet = await createDefaultWallet({
    wallet: { baseDir: tmp },
  });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password });

  const result = await wallet.deriveConfiguredAddresses({ keyId });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);

  const btcItem = result.items.find((item) => item.chain === "btc");
  const evmItem = result.items.find((item) => item.chain === "evm");

  assert.ok(btcItem);
  assert.ok(evmItem);
  assert.equal(btcItem.path, "m/84'/0'/0'/0/1");
  assert.equal(evmItem.path, "m/44'/60'/0'/0/1");
  assert.equal(btcItem.name, "multi-btc");
  assert.equal(evmItem.name, "multi-evm");
  assert.match(evmItem.address, /^0x[0-9a-fA-F]{40}$/);
  assert.ok(typeof btcItem.address === "string" && btcItem.address.length > 10);
});
