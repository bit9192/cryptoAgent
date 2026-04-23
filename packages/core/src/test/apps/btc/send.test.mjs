import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as bitcoin from "bitcoinjs-lib";

import { encryptPathToFile } from "../../../modules/key/encrypt.mjs";
import { createWallet } from "../../../apps/wallet/index.mjs";
import { createBtcProvider } from "../../../apps/btc/provider.mjs";
import { btcTxBuild, btcTxSign, btcTxBroadcast } from "../../../apps/btc/write.mjs";
import { resolveBtcProvider } from "../../../apps/btc/netprovider.mjs";

const SOURCE_ADDRESS = "tb1qaj7xjx360uzkd88kclp2pmv2qj0g6dkycv3spc";
const SOURCE_PATH = "m/84'/1'/0'/0/1";
const TO_DEFAULT = "tb1qe38akah45pc230agwmzx5wawwxrs0v429hws9e";
const REGTEST_SOURCE_ADDRESS = "bcrt1qaj7xjx360uzkd88kclp2pmv2qj0g6dky69gak3";
const REGTEST_TO_DEFAULT = "bcrt1qe38akah45pc230agwmzx5wawwxrs0v4287hajs";

async function mkTmpDir() {
	return fs.mkdtemp(path.join(os.tmpdir(), "wallet-btc-send-"));
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

async function readMnemonicFromTestKey() {
	const thisFile = fileURLToPath(import.meta.url);
	const testKeyPath = path.join(path.dirname(thisFile), "test.key.md");
	const content = await fs.readFile(testKeyPath, "utf8");
	const firstLine = String(content).split(/\r?\n/, 1)[0].trim();
	if (!firstLine || firstLine.split(" ").length < 12) {
		throw new Error("test.key.md 第一行助记词无效");
	}
	return firstLine;
}

test("btc send/testnet: wallet build -> sign -> broadcast", { timeout: 120000 }, async (t) => {
	// 默认跳过，避免误发真实链交易
	if (process.env.BTC_TESTNET_SEND !== "1") {
		t.skip("未开启 BTC_TESTNET_SEND=1，跳过 testnet 真网发送测试");
		return;
	}

	const mnemonic = await readMnemonicFromTestKey();
	const tmp = await mkTmpDir();
	const password = process.env.BTC_TESTNET_KEY_PASSWORD ?? "wallet-pass-123";

	await writeEncryptedKeyDoc(
		tmp,
		"key/btc-send-testnet.enc.json",
		password,
		["wallet-btc-send-testnet", mnemonic].join("\n"),
	);

	const wallet = createWallet({ baseDir: tmp });
	const loaded = await wallet.loadKeyFile({ password });
	const keyId = loaded.addedKeyIds[0];

	await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
	await wallet.registerProvider({ provider: createBtcProvider() });

	const { signer } = await wallet.getSigner({ chain: "btc", keyId, options: { network: "testnet" } });

	// 确认派生地址与预期一致，避免误用路径或网络
	const derived = await signer.getAddress({ addressType: "p2wpkh", path: SOURCE_PATH });
	assert.equal(derived, SOURCE_ADDRESS);

	const to = process.env.BTC_TESTNET_SEND_TO ?? TO_DEFAULT;
	const amountSats = Number(process.env.BTC_TESTNET_SEND_AMOUNT_SATS ?? 1000);
	const feeRateSatVb = Number(process.env.BTC_TESTNET_SEND_FEE_RATE_SATVB ?? 2);

	assert.ok(Number.isInteger(amountSats) && amountSats > 546, "amountSats 必须是 >546 的整数");
	assert.ok(Number.isFinite(feeRateSatVb) && feeRateSatVb > 0, "feeRateSatVb 必须 >0");

	const built = await btcTxBuild(
		{
			fromAddresses: [{
				address: SOURCE_ADDRESS,
				derivePath: SOURCE_PATH,
				addressType: "p2wpkh",
			}],
			to,
			amountSats,
			feeRateSatVb,
			changeAddress: SOURCE_ADDRESS,
		},
		"testnet",
	);
	assert.equal(built.ok, true);
	assert.ok(built.psbtBase64);
	assert.ok(Array.isArray(built.signingRequests) && built.signingRequests.length > 0);

	const signed = await btcTxSign(built, signer);
	assert.equal(signed.ok, true);
	assert.ok(signed.result?.txHex, "签名后应有 txHex");
	assert.ok(signed.result?.txid, "签名后应有 txid");

	// 发送开关：默认只构建+签名；设置 BTC_TESTNET_BROADCAST=1 才广播
	if (process.env.BTC_TESTNET_BROADCAST !== "1") {
		t.diagnostic(`已签名但未广播。预估手续费=${built.estimatedFeeSats} sats, txid=${signed.result.txid}`);
		return;
	}

	const sent = await btcTxBroadcast(signed.result.txHex, "testnet");
	assert.equal(sent.ok, true);
	assert.ok(sent.txid, "广播结果应返回 txid");
	t.diagnostic(`已广播 testnet 交易 txid=${sent.txid}`);
});

test("btc send/regtest: wallet build -> sign -> broadcast (local node)", { timeout: 180000 }, async (t) => {
	if (process.env.BTC_REGTEST_SEND !== "1") {
		t.skip("未开启 BTC_REGTEST_SEND=1，跳过 regtest 本地转账测试");
		return;
	}

	const rpcProvider = resolveBtcProvider("regtest");
	const health = await rpcProvider.healthcheck();
	if (!health?.healthy) {
		t.skip(`regtest 节点不可用：${health?.error ?? "unknown"}`);
		return;
	}

	const mnemonic = await readMnemonicFromTestKey();
	const tmp = await mkTmpDir();
	const password = process.env.BTC_REGTEST_KEY_PASSWORD ?? "wallet-pass-123";

	await writeEncryptedKeyDoc(
		tmp,
		"key/btc-send-regtest.enc.json",
		password,
		["wallet-btc-send-regtest", mnemonic].join("\n"),
	);

	const wallet = createWallet({ baseDir: tmp });
	const loaded = await wallet.loadKeyFile({ password });
	const keyId = loaded.addedKeyIds[0];

	await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
	await wallet.registerProvider({ provider: createBtcProvider() });

	const { signer } = await wallet.getSigner({ chain: "btc", keyId, options: { network: "regtest" } });
	const derived = await signer.getAddress({ addressType: "p2wpkh", path: SOURCE_PATH });
	assert.equal(derived, REGTEST_SOURCE_ADDRESS);

	// 默认自动挖矿给来源地址充值，并通过第二阶段挖矿确保来源 UTXO 全部成熟
	if (process.env.BTC_REGTEST_AUTO_MINE !== "0") {
		await rpcProvider.rpcCall("generatetoaddress", [101, REGTEST_SOURCE_ADDRESS]);
		await rpcProvider.rpcCall("generatetoaddress", [101, REGTEST_TO_DEFAULT]);
	}

	const to = process.env.BTC_REGTEST_SEND_TO ?? REGTEST_TO_DEFAULT;
	const amountSats = Number(process.env.BTC_REGTEST_SEND_AMOUNT_SATS ?? 10000);
	const feeRateSatVb = Number(process.env.BTC_REGTEST_SEND_FEE_RATE_SATVB ?? 1);

	assert.ok(Number.isInteger(amountSats) && amountSats > 546, "amountSats 必须是 >546 的整数");
	assert.ok(Number.isFinite(feeRateSatVb) && feeRateSatVb > 0, "feeRateSatVb 必须 >0");

	const built = await btcTxBuild(
		{
			fromAddresses: [{
				address: REGTEST_SOURCE_ADDRESS,
				derivePath: SOURCE_PATH,
				addressType: "p2wpkh",
			}],
			to,
			amountSats,
			feeRateSatVb,
			changeAddress: REGTEST_SOURCE_ADDRESS,
		},
		"regtest",
	);
	assert.equal(built.ok, true);

	const signed = await btcTxSign(built, signer);
	assert.equal(signed.ok, true);
	assert.ok(signed.result?.txHex, "签名后应有 txHex");

	const sent = await btcTxBroadcast(signed.result.txHex, "regtest");
	assert.equal(sent.ok, true);
	assert.ok(sent.txid, "广播结果应返回 txid");

	if (process.env.BTC_REGTEST_MINE_CONFIRM !== "0") {
		await rpcProvider.rpcCall("generatetoaddress", [1, REGTEST_TO_DEFAULT]);
	}

	t.diagnostic(`已广播 regtest 交易 txid=${sent.txid}, fee=${built.estimatedFeeSats} sats`);
});

test("btc send/regtest: p2wsh 2-of-2 multisig build -> sign -> broadcast", { timeout: 240000 }, async (t) => {
	if (process.env.BTC_REGTEST_MULTISIG_SEND !== "1") {
		t.skip("未开启 BTC_REGTEST_MULTISIG_SEND=1，跳过 regtest 多签转账测试");
		return;
	}

	const rpcProvider = resolveBtcProvider("regtest");
	const health = await rpcProvider.healthcheck();
	if (!health?.healthy) {
		t.skip(`regtest 节点不可用：${health?.error ?? "unknown"}`);
		return;
	}

	const mnemonic = await readMnemonicFromTestKey();
	const tmp = await mkTmpDir();
	const password = process.env.BTC_REGTEST_KEY_PASSWORD ?? "wallet-pass-123";

	await writeEncryptedKeyDoc(
		tmp,
		"key/btc-send-regtest-multisig.enc.json",
		password,
		["wallet-btc-send-regtest-multisig", mnemonic].join("\n"),
	);

	const wallet = createWallet({ baseDir: tmp });
	const loaded = await wallet.loadKeyFile({ password });
	const keyId = loaded.addedKeyIds[0];

	await wallet.unlock({ keyId, password, scope: { chain: "btc" } });
	await wallet.registerProvider({ provider: createBtcProvider() });

	const { signer } = await wallet.getSigner({ chain: "btc", keyId, options: { network: "regtest" } });
	const path1 = "m/84'/1'/0'/0/10";
	const path2 = "m/84'/1'/0'/0/11";
	const { publicKey: pub1 } = await signer.getPublicKey({ addressType: "p2wpkh", path: path1 });
	const { publicKey: pub2 } = await signer.getPublicKey({ addressType: "p2wpkh", path: path2 });

	const p2ms = bitcoin.payments.p2ms({
		m: 2,
		pubkeys: [pub1, pub2],
		network: bitcoin.networks.regtest,
	});
	const p2wsh = bitcoin.payments.p2wsh({
		redeem: p2ms,
		network: bitcoin.networks.regtest,
	});
	const multisigAddress = p2wsh.address;

	if (process.env.BTC_REGTEST_AUTO_MINE !== "0") {
		await rpcProvider.rpcCall("generatetoaddress", [101, multisigAddress]);
		await rpcProvider.rpcCall("generatetoaddress", [101, REGTEST_TO_DEFAULT]);
	}

	const to = process.env.BTC_REGTEST_MULTISIG_SEND_TO ?? REGTEST_TO_DEFAULT;
	const amountSats = Number(process.env.BTC_REGTEST_MULTISIG_SEND_AMOUNT_SATS ?? 12000);
	const feeRateSatVb = Number(process.env.BTC_REGTEST_MULTISIG_SEND_FEE_RATE_SATVB ?? 1);

	assert.ok(Number.isInteger(amountSats) && amountSats > 546, "amountSats 必须是 >546 的整数");
	assert.ok(Number.isFinite(feeRateSatVb) && feeRateSatVb > 0, "feeRateSatVb 必须 >0");

	const built = await btcTxBuild(
		{
			fromAddresses: [{
				address: multisigAddress,
				derivePaths: [path1, path2],
				addressType: "p2wsh-multisig",
				witnessScript: Buffer.from(p2ms.output).toString("hex"),
			}],
			to,
			amountSats,
			feeRateSatVb,
			changeAddress: multisigAddress,
		},
		"regtest",
	);
	assert.equal(built.ok, true);
	assert.equal(built.signingRequests.length >= 2, true);

	const signed = await btcTxSign(built, signer);
	assert.equal(signed.ok, true);
	assert.ok(signed.result?.txHex, "签名后应有 txHex");

	const sent = await btcTxBroadcast(signed.result.txHex, "regtest");
	assert.equal(sent.ok, true);
	assert.ok(sent.txid, "广播结果应返回 txid");

	if (process.env.BTC_REGTEST_MINE_CONFIRM !== "0") {
		await rpcProvider.rpcCall("generatetoaddress", [1, REGTEST_TO_DEFAULT]);
	}

	t.diagnostic(`已广播 regtest 多签交易 txid=${sent.txid}, fee=${built.estimatedFeeSats} sats`);
});