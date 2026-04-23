import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonRpcProvider } from "ethers";
import { encryptPathToFile } from "../../../../modules/key/encrypt.mjs";
import { createWallet } from "../../../../apps/wallet/index.mjs";
import { createEvmProvider, wrapEvmSignerAsEthersSigner } from "../../../../apps/evm/provider.mjs";

import {
	deploy,
	getContract,
} from "../../../../apps/evm/contracts/deploy.mjs";

const DEFAULT_FORK_RPC = "http://127.0.0.1:8545";
const DEFAULT_DEV_PRIVATE_KEY =
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function mkTmpDir(prefix) {
	return fs.mkdtemp(path.join(os.tmpdir(), prefix));
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

async function isRpcReachable(rpcUrl) {
	try {
		const provider = new JsonRpcProvider(rpcUrl);
		await provider.getBlockNumber();
		return true;
	} catch {
		return false;
	}
}

async function createForkSigner() {
	const rpcUrl = String(process.env.EVM_DEPLOY_RPC_URL ?? DEFAULT_FORK_RPC).trim();
	const reachable = await isRpcReachable(rpcUrl);

	const walletBaseDir = await mkTmpDir("wallet-evm-deploy-");
	const password = "wallet-pass-123";
	const privateKey = String(process.env.EVM_DEPLOY_PRIVATE_KEY ?? DEFAULT_DEV_PRIVATE_KEY).trim();

	await writeEncryptedKeyDoc(
		walletBaseDir,
		"key/evm-deploy.enc.json",
		password,
		[
			"wallet-evm-deploy",
			privateKey,
		].join("\n"),
	);

	const wallet = createWallet({ baseDir: walletBaseDir });
	const loaded = await wallet.loadKeyFile({ password });
	const keyId = loaded.addedKeyIds[0];
	await wallet.unlock({ keyId, password, scope: { chain: "evm" } });
	await wallet.registerProvider({ provider: createEvmProvider() });
	const signerRes = await wallet.getSigner({ chain: "evm", keyId, rpc: rpcUrl });
	const signer = wrapEvmSignerAsEthersSigner({ signer: signerRes.signer, rpc: rpcUrl });

	return {
		rpcUrl,
		reachable,
		signer,
		rawSigner: signerRes.signer,
	};
}

test("evm deploy: fork 网络可部署 dev/Test.sol::TEST11111 并读取", { timeout: 180000 }, async (t) => {
	if (process.env.EVM_DEPLOY_TEST !== "1") {
		t.skip("未开启 EVM_DEPLOY_TEST=1，跳过 deploy 集成测试");
		return;
	}

	const { rpcUrl, reachable, signer } = await createForkSigner();
	if (!reachable) {
		t.skip(`fork rpc 不可用: ${rpcUrl}`);
		return;
	}

	const deployed = await deploy("TEST11111", [], {
		networkName: "fork",
		signer,
	});

	assert.equal(typeof deployed.address, "string");
	assert.ok(deployed.address.startsWith("0x"));
	// assert.equal(deployed.deploymentKey, deploymentKey);

	const contract = await getContract("TEST11111", null, {
		networkName: "fork",
		signer,
	});

	const [name, symbol, decimals] = await Promise.all([
		contract.name(),
		contract.symbol(),
		contract.decimals(),
	]);

	assert.equal(name, "test");
	assert.equal(symbol, "test");
	assert.equal(Number(decimals), 18);
	// assert.equal(String(contract.target).toLowerCase(), deployed.address.toLowerCase());
});

test("evm deploy: provider-only 合约可 connect 原始 signer 并写入状态", { timeout: 180000 }, async (t) => {
	if (process.env.EVM_DEPLOY_TEST !== "1") {
		t.skip("未开启 EVM_DEPLOY_TEST=1，跳过 connect 集成测试");
		return;
	}

	const { rpcUrl, reachable, signer, rawSigner } = await createForkSigner();
	if (!reachable) {
		t.skip(`fork rpc 不可用: ${rpcUrl}`);
		return;
	}

	const deployed = await deploy("TEST11111", [], {
		networkName: "fork",
		signer,
	});

	const readOnlyContract = await getContract("TEST11111", deployed.address, {
		networkName: "fork",
		rpcUrl,
	});
	const receiver = await signer.getAddress();
	const before = await readOnlyContract.balanceOf(receiver);

	const connected = readOnlyContract.connect(rawSigner);
	assert.equal(connected.address, deployed.address);
	assert.equal(typeof connected.runner.sendTransaction, "function");
	assert.ok(connected.runner.provider);

	const mintTx = await connected.mint(receiver, 123n);
	await mintTx.wait();

	const after = await readOnlyContract.balanceOf(receiver);
	assert.equal(after - before, 123n);
	assert.equal(await connected.name(), "test");
});
