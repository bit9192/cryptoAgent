import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import bs58 from "bs58";

import { Wallet, verifyMessage } from "ethers";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { createWallet } from "../../apps/wallet/index.mjs";
import { createEvmProvider } from "../../apps/evm/provider.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wallet-evm-provider-"));
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

test("evm provider: getSigner/getAddress/signMessage 真实行为", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const privateKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  await writeEncryptedKeyDoc(
    tmp,
    "key/evm.enc.json",
    password,
    [
      "wallet-evm",
      privateKeyHex,
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "evm" } });
  await wallet.registerProvider({ provider: createEvmProvider() });

  const signerRes = await wallet.getSigner({ chain: "evm", keyId });
  assert.equal(signerRes.ok, true);

  const address = await signerRes.signer.getAddress();
  const expectedAddress = new Wallet(`0x${privateKeyHex}`).address;
  assert.equal(address, expectedAddress);

  const signed = await signerRes.signer.signMessage("hello-wallet");
  assert.equal(signed.ok, true);
  assert.equal(signed.operation, "signMessage");

  const recovered = verifyMessage("hello-wallet", signed.result);
  assert.equal(recovered, expectedAddress);
});

test("evm provider: scope 限制链时应拒绝调用", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";

  await writeEncryptedKeyDoc(
    tmp,
    "key/evm-scope.enc.json",
    password,
    [
      "wallet-evm-scope",
      "1111111111111111111111111111111111111111111111111111111111111111",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createEvmProvider() });

  const signerRes = await wallet.getSigner({ chain: "evm", keyId });
  await assert.rejects(
    () => signerRes.signer.getAddress(),
    /scope 限制|不允许链/i,
  );
});

test("evm provider: WIF 私钥也应可用（由 wallet 默认派生转换）", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const privateKeyHex = "7777777777777777777777777777777777777777777777777777777777777777";
  const wif = toWif(privateKeyHex);

  await writeEncryptedKeyDoc(
    tmp,
    "key/evm-wif.enc.json",
    password,
    [
      "wallet-evm-wif",
      wif,
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "evm" } });
  await wallet.registerProvider({ provider: createEvmProvider() });

  const signerRes = await wallet.getSigner({ chain: "evm", keyId });
  const address = await signerRes.signer.getAddress();
  const expectedAddress = new Wallet(`0x${privateKeyHex}`).address;
  assert.equal(address, expectedAddress);
});
