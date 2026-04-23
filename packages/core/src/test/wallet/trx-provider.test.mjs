import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Wallet, recoverAddress } from "ethers";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { createWallet } from "../../apps/wallet/index.mjs";
import { createTrxProvider } from "../../apps/trx/provider.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wallet-trx-provider-"));
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

test("trx provider: getSigner/getAddress/signMessage 真实行为", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";
  const privateKeyHex = "4444444444444444444444444444444444444444444444444444444444444444";

  await writeEncryptedKeyDoc(
    tmp,
    "key/trx.enc.json",
    password,
    ["wallet-trx", privateKeyHex].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "trx" } });
  await wallet.registerProvider({ provider: createTrxProvider() });

  const signerRes = await wallet.getSigner({ chain: "trx", keyId });
  const address = await signerRes.signer.getAddress();
  assert.equal(typeof address, "string");
  assert.ok(address.startsWith("T"));

  const signed = await signerRes.signer.signMessage("hello-trx");
  assert.equal(signed.ok, true);
  assert.equal(signed.operation, "signMessage");

  const recovered = recoverAddress(signed.meta.digest, signed.result);
  const expectedEthAddr = new Wallet(`0x${privateKeyHex}`).address;
  assert.equal(recovered, expectedEthAddr);
});

test("trx provider: scope 限制链时应拒绝调用", async () => {
  const tmp = await mkTmpDir();
  const password = "wallet-pass-123";

  await writeEncryptedKeyDoc(
    tmp,
    "key/trx-scope.enc.json",
    password,
    [
      "wallet-trx-scope",
      "5555555555555555555555555555555555555555555555555555555555555555",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
  await wallet.registerProvider({ provider: createTrxProvider() });

  const signerRes = await wallet.getSigner({ chain: "trx", keyId });
  await assert.rejects(
    () => signerRes.signer.getAddress(),
    /scope 限制|不允许链/i,
  );
});
