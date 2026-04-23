import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import bs58 from "bs58";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { createWallet } from "../../apps/wallet/index.mjs";
import { createBtcProvider } from "../../apps/btc/provider.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wallet-btc-provider-"));
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

function sha256(bytes) {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function toWif(privateKeyHex) {
  const key = Buffer.from(String(privateKeyHex).replace(/^0x/, ""), "hex");
  const payload = Buffer.concat([Buffer.from([0x80]), key, Buffer.from([0x01])]);
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return bs58.encode(Buffer.concat([payload, checksum]));
}

test("btc provider: getSigner/getAddress/signMessage 真实行为", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const privateKeyHex = "2222222222222222222222222222222222222222222222222222222222222222";

  await writeEncryptedKeyDoc(
    tmp,
    "key/btc.enc.json",
    password,
    ["wallet-btc", privateKeyHex].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const signerRes = await wallet.getSigner({ chain: "btc", keyId });
  const address = await signerRes.signer.getAddress();
  assert.equal(typeof address, "string");
  assert.ok(address.length >= 26);

  const signed = await signerRes.signer.signMessage("hello-btc");
  assert.equal(signed.ok, true);
  assert.equal(signed.operation, "signMessage");
  // BTC 签名是 raw ECDSA（64 字节 hex），非 EVM 格式
  assert.equal(typeof signed.result, "string");
  assert.ok(signed.result.length >= 128, `签名 hex 长度应 >=128，got ${signed.result.length}`);
  assert.ok(/^[0-9a-f]+$/i.test(signed.result), "签名应为合法 hex");
});

test("btc provider: scope 限制链时应拒绝调用", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";

  await writeEncryptedKeyDoc(
    tmp,
    "key/btc-scope.enc.json",
    password,
    [
      "wallet-btc-scope",
      "3333333333333333333333333333333333333333333333333333333333333333",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "evm" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const signerRes = await wallet.getSigner({ chain: "btc", keyId });
  await assert.rejects(
    () => signerRes.signer.getAddress(),
    /scope 限制|不允许链/i,
  );
});

test("btc provider: 助记词支持多路径与 addressType", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const mnemonic = "test test test test test test test test test test test junk";

  await writeEncryptedKeyDoc(
    tmp,
    "key/btc-mnemonic.enc.json",
    password,
    ["wallet-btc-mnemonic", mnemonic].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const signerRes = await wallet.getSigner({ chain: "btc", keyId });

  const result = await signerRes.signer.getAddress({
    addressType: "p2wpkh",
    paths: [
      "m/84'/0'/0'/0/0",
      "m/84'/0'/0'/0/1",
    ],
  });

  assert.equal(typeof result, "object");
  assert.equal(result.addressType, "p2wpkh");
  assert.equal(result.network, "mainnet");
  assert.equal(Array.isArray(result.addresses), true);
  assert.equal(result.addresses.length, 2);
  assert.ok(result.addresses[0].address.startsWith("bc1"));
  assert.ok(result.addresses[1].address.startsWith("bc1"));
  assert.notEqual(result.addresses[0].address, result.addresses[1].address);

  const nested = await signerRes.signer.getAddress({
    addressType: "p2sh-p2wpkh",
    path: "m/49'/0'/0'/0/0",
  });
  assert.equal(typeof nested, "string");
  assert.ok(nested.startsWith("3"));
});

// ── test.key.md 助记词集成验证 ──────────────────────────────────────────────────
const TEST_KEY_MNEMONIC =
  "side dog pig sausage retire trap voyage wool fox awake ripple defense remove bright palm unknown rail grocery embody recipe absurd rude boat useless";

test("btc provider: test.key.md 助记词 × 4 种地址类型验证", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";

  await writeEncryptedKeyDoc(
    tmp,
    "key/btc-testkey.enc.json",
    password,
    ["wallet-btc-testkey", TEST_KEY_MNEMONIC].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const { signer } = await wallet.getSigner({ chain: "btc", keyId });

  // mainnet 4 种地址 index=0
  const cases = [
    { addressType: "p2pkh",       path: "m/44'/0'/0'/0/0", expected: "1Pv6K53HSbXVdjFPdL9PLUm46SiZZvwMKg" },
    { addressType: "p2sh-p2wpkh", path: "m/49'/0'/0'/0/0", expected: "39vqbVsLHuFav7S74vagQo7TeGAzJH2rPG" },
    { addressType: "p2wpkh",      path: "m/84'/0'/0'/0/0", expected: "bc1qah24v94c3l0qm8e9l7a55y8r5zypx6nx53j88y" },
    { addressType: "p2tr",        path: "m/86'/0'/0'/0/0", expected: "bc1pypnf0zx2ql6jsvd876nek349y8n5gz3f8xa2qm205vxw4evc58nq88q739" },
  ];
  for (const { addressType, path, expected } of cases) {
    const got = await signer.getAddress({ addressType, path });
    assert.equal(got, expected, `${addressType}: got ${got}`);
  }

  // testnet p2tr index=0
  const { signer: testnetSigner } = await wallet.getSigner({
    chain: "btc",
    keyId,
    options: { network: "testnet" },
  });
  const tbAddr = await testnetSigner.getAddress({ addressType: "p2tr", path: "m/86'/1'/0'/0/0" });
  assert.equal(tbAddr, "tb1pk6qs37n2awsscuavqp2rmcpqlhpvzjfytp00nslhg8ql5cmdp7ws6pwhvv");
});

test("btc provider: ecProvider 覆盖默认派生（WIF 私钥）", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const privateKeyHex = "6666666666666666666666666666666666666666666666666666666666666666";
  const wif = toWif(privateKeyHex);

  await writeEncryptedKeyDoc(
    tmp,
    "key/btc-wif.enc.json",
    password,
    ["wallet-btc-wif", wif].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createBtcProvider() });

  const signerRes = await wallet.getSigner({ chain: "btc", keyId });
  const address = await signerRes.signer.getAddress({ addressType: "p2pkh" });
  assert.equal(typeof address, "string");
  assert.ok(address.length >= 26);
});
