import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";

import { encryptPathToFile } from "../../../modules/key/encrypt.mjs";
import { createWallet } from "../../../apps/wallet/index.mjs";
import { createEvmProvider } from "../../../apps/evm/provider.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wallet-evm-flow-"));
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

test("evm flow: wallet signer -> sendTransaction (fork)", { timeout: 180000 }, async (t) => {
  if (process.env.EVM_FLOW_TEST !== "1") {
    t.skip("未开启 EVM_FLOW_TEST=1，跳过 EVM 流程测试");
    return;
  }

  const rpcUrl = String(process.env.EVM_FLOW_RPC_URL ?? "http://127.0.0.1:8546").trim();
  const provider = new JsonRpcProvider(rpcUrl);

  // Hardhat/fork 默认账户 0，便于本地集成验证
  const privateKey = String(
    process.env.EVM_FLOW_PRIVATE_KEY
      ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  ).trim();
  const password = String(process.env.EVM_FLOW_KEY_PASSWORD ?? "wallet-pass-123").trim();

  const defaultTo = new Wallet(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  ).address;
  const sendTo = String(process.env.EVM_FLOW_SEND_TO ?? defaultTo).trim();
  const amountEth = String(process.env.EVM_FLOW_SEND_AMOUNT_ETH ?? "0.0001").trim();

  const tmp = await mkTmpDir();
  await writeEncryptedKeyDoc(tmp, "key/evm-flow.enc.json", password, ["wallet-evm-flow", privateKey].join("\n"));

  const wallet = createWallet({ baseDir: tmp });
  const loaded = await wallet.loadKeyFile({ password });
  const keyId = loaded.addedKeyIds[0];

  await wallet.unlock({ keyId, password, scope: { chain: "evm" } });
  await wallet.registerProvider({ provider: createEvmProvider() });

  const { signer } = await wallet.getSigner({
    chain: "evm",
    keyId,
    rpc: provider,
  });

  const fromAddress = await signer.getAddress();
  const network = await provider.getNetwork();
  const before = await provider.getBalance(fromAddress);

  t.diagnostic(`network chainId=${network.chainId.toString()} rpc=${rpcUrl}`);
  t.diagnostic(`from=${fromAddress} balance=${formatEther(before)} ETH`);

  const txRes = await signer.sendTransaction({
    to: sendTo,
    value: parseEther(amountEth),
  });

  assert.equal(txRes.ok, true);
  assert.equal(txRes.operation, "sendTransaction");
  assert.ok(txRes.result?.hash, "应返回交易 hash");

  const receipt = await txRes.result.wait();
  assert.ok(receipt, "应拿到交易回执");
  assert.equal(Number(receipt.status), 1, "交易应成功");

  t.diagnostic(`txHash=${txRes.result.hash}`);
  t.diagnostic(`to=${sendTo} value=${amountEth} ETH`);
});
