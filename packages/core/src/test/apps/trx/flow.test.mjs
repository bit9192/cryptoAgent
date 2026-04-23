import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { encryptPathToFile } from "../../../modules/key/encrypt.mjs";
import { createWallet } from "../../../apps/wallet/index.mjs";
import { createTrxProvider } from "../../../apps/trx/provider.mjs";
import {
  trxBalanceGet,
  trxSend,
  createTrc20,
} from "../../../apps/trx/index.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wallet-trx-flow-"));
}

async function writeEncryptedKeyDoc(baseDir, relativeOutput, password, content) {
  const sourceDir = path.join(baseDir, "fixtures");
  const sourceFile = path.join(sourceDir, `${path.basename(relativeOutput)}.md`);
  const outputFile = path.join(baseDir, relativeOutput);

  await fs.mkdir(path.dirname(sourceFile), { recursive: true });
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(sourceFile, content, "utf8");

  await encryptPathToFile({ inputPath: sourceFile, password, outputFile });
  return outputFile;
}

test("trx flow: accounts -> balance -> send -> trc20", { timeout: 180000 }, async (t) => {
  if (process.env.TRX_FLOW_TEST !== "1") {
    t.skip("未开启 TRX_FLOW_TEST=1，跳过 TRX 流程测试");
    return;
  }

  const networkName = String(process.env.TRX_FLOW_NETWORK ?? "nile").trim();
  const privateKey = String(
    process.env.TRX_FLOW_PRIVATE_KEY
      ?? "4444444444444444444444444444444444444444444444444444444444444444",
  ).trim();
  const password = String(process.env.TRX_FLOW_KEY_PASSWORD ?? "wallet-pass-123").trim();

  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(tmp, "key/trx-flow.enc.json", password, ["wallet-trx-flow", privateKey].join("\n"));

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "trx" } });
  await wallet.registerProvider({ provider: createTrxProvider() });

  const { signer } = await wallet.getSigner({
    chain: "trx",
    keyId,
    options: { network: networkName },
  });
  const address = await signer.getAddress();
  t.diagnostic(`signer[0] address=${address} network=${networkName}`);

  const bal = await trxBalanceGet(address, networkName);
  assert.equal(bal.address, address);
  assert.equal(bal.networkName, networkName);
  t.diagnostic(`balance total=${bal.total} TRX available=${bal.available} TRX`);

  const sendTo = String(process.env.TRX_FLOW_SEND_TO ?? "").trim();
  if (process.env.TRX_FLOW_SEND === "1") {
    if (!sendTo) {
      t.skip("开启 TRX_FLOW_SEND=1 时需要设置 TRX_FLOW_SEND_TO");
      return;
    }

    const amountTrx = Number(process.env.TRX_FLOW_SEND_AMOUNT_TRX ?? 0.1);
    const tx = await trxSend(signer, sendTo, amountTrx, networkName);
    assert.equal(tx.ok, true);
    assert.ok(tx.txHash, "转账应返回 txHash");
    t.diagnostic(`native send txHash=${tx.txHash}`);
  }

  const trc20Address = String(process.env.TRX_FLOW_TRC20_ADDRESS ?? "").trim();
  if (trc20Address) {
    const token = createTrc20({
      tokenName: "TRC20",
      address: trc20Address,
      networkNameOrProvider: networkName,
      signer,
    });

    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const rawBal = await token.balanceOf(address);
    t.diagnostic(`trc20 symbol=${symbol} decimals=${decimals} balanceRaw=${rawBal.toString()}`);

    if (process.env.TRX_FLOW_TRC20_TRANSFER === "1") {
      if (!sendTo) {
        t.skip("开启 TRX_FLOW_TRC20_TRANSFER=1 时需要设置 TRX_FLOW_SEND_TO");
        return;
      }
      const amountRaw = BigInt(process.env.TRX_FLOW_TRC20_AMOUNT_RAW ?? "1");
      const transfer = await token.transfer(sendTo, amountRaw);
      assert.ok(transfer.txHash, "TRC20 transfer 应返回 txHash");
      t.diagnostic(`trc20 transfer txHash=${transfer.txHash}`);
    }
  }
});
