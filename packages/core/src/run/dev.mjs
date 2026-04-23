import createWallet from "../apps/wallet/index.mjs";
import { execute, defineTask, createMutableRegistry } from "../execute/index.mjs";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {unlockWallet} from "./wallet/unlock.mjs"
import walletList from "./wallet/wallet-list.mjs"

const TASK_ID = "demo.wallet.open";
const ENCRYPTED_FILE_SUFFIX = ".enc.json";

async function walkEncryptedFiles(dirPath) {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	entries.sort((a, b) => a.name.localeCompare(b.name));

	const files = [];
	for (const entry of entries) {
		const abs = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...await walkEncryptedFiles(abs));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(ENCRYPTED_FILE_SUFFIX)) {
			files.push(abs);
		}
	}
	return files;
}

async function listLocalKeyFiles(storageRootAbs) {
	try {
		const stat = await fs.stat(storageRootAbs);
		if (!stat.isDirectory()) {
			return [];
		}
	} catch {
		return [];
	}

	const files = await walkEncryptedFiles(storageRootAbs);
	return files.map((abs) => ({
		abs,
		rel: path.relative(process.cwd(), abs) || abs,
	}));
}

const task = defineTask({
	id: TASK_ID,
	title: "Demo: prompt password and open wallet",
	async run() {

		const {
			wallet,
			hd,
			key,
			devHd,
			devKey,
			totalUnlocked,
			warnings,
			failedFiles,
			keyList,
			hdList
		} = await unlockWallet([
			// "inline"
			// "walletold",
			"walletnew"
		], {
			mnemonicChecksumMode: "compat",
		});
		console.log(
			{
				hdCount: hdList.length,
				keyCount: keyList.length,
				totalUnlocked,
				failedFiles,
				warnings,
			},
			" unlock summary"
		)
		// console.log(
		// 	totalUnlocked,
		// 	key
		// )


		
		const chainState = await wallet.listChains();
		console.log(
			chainState, " chainState"
		)
		
		const selectedEntries = [
			// 优先使用第一个 HD；没有时回退到其它可用条目
			...hdList,
			...keyList,
			// devHd,
			// devKey,
		].filter(Boolean);

		if (selectedEntries.length === 0) {
			throw new Error("未找到可用已解锁 key（hdList/keyList/dev keys 均为空）");
		}

		const wallets = await Promise.all(
			selectedEntries.map(async v => {
				return {
					name: v.name,
					signer: await wallet.getSigner({
						chain: "evm",
						keyId: v.keyId,
					})
				}
			})
		)

		// console.log(
		// 	wallets, " wallets"
		// )

		const addresses = await Promise.all(
			wallets.map(async v => {
				try {
					const paths = Array.from({ length: 11 }, (_, i) => `m/44'/60'/0'/0/${i}`);
					const result = await v.signer.signer.getAddress({
						paths,
						returnAll: true,
					});

					return {
						name: v.name,
						addresses: result,
					};
				} catch(error) {
					console.log(error)
					return {
						name: v.name,
						addresses: {address:[] }
					}
				}
				
			})
		)

		console.log(
			addresses.map(v => {
				return [
					v.name,
					...v.addresses.addresses
				]
			})
		)
		
		

		// console.log({ hd, key, devHd, devKey });
		return {
			ok: true,
			hd,
			key,
			devHd,
			devKey
		};
	},
});

export async function runWalletOpenDemo(options = {}) {
	if (typeof options.interact !== "function") {
		throw new Error("Missing interact handler: please pass options.interact from external layer");
	}

	const registry = createMutableRegistry();
	registry.register(task);

	const walletApp = options.wallet ?? createWallet({ baseDir: options.baseDir ?? "btckey" });
	const result = await execute(
		{ task: TASK_ID, source: options.source ?? "run", network: options.network },
		{
			registry,
			wallet: walletApp,
			interact: options.interact,
			confirm: options.confirm,
		},
	);

	if (!result.ok) {
		throw new Error(result.error?.message ?? "unknown");
	}

	return result.data;
}

// dev 场景：直接从 wallet 导出 signer
export async function exportDevSigner(options = {}) {
	const chain = String(options.chain ?? "evm").trim();
	const keyName = String(options.keyName ?? "").trim();
	const walletApp = options.wallet ?? createWallet({ baseDir: options.baseDir ?? process.cwd() });

	const loaded = await walletApp.loadDevKeys({
		reload: Boolean(options.reload),
		names: keyName ? [keyName] : undefined,
	});

	if (!loaded.ok) {
		throw new Error("loadDevKeys 失败");
	}

	const listed = await walletApp.listKeys({ tags: ["dev"] });
	const keys = listed.items ?? [];
	if (keys.length === 0) {
		throw new Error("未找到 dev key，请先 loadDevKeys");
	}

	const selected = keyName
		? keys.find((k) => String(k.name ?? "") === keyName)
		: keys[0];

	if (!selected) {
		throw new Error(`未找到指定 dev key: ${keyName}`);
	}

	const signerResult = await walletApp.getSigner({
		chain,
		keyId: selected.keyId,
		rpc: options.rpc,
		options: options.signerOptions,
	});

	if (!signerResult?.ok || !signerResult.signer) {
		throw new Error("getSigner 失败");
	}

	return {
		ok: true,
		chain,
		keyId: selected.keyId,
		keyName: selected.name,
		signer: signerResult.signer,
	};
}

export const run = runWalletOpenDemo;

async function main() {
	const storageKeyRoot = path.resolve(process.cwd(), "storage/key");
	const keyFile = String(process.env.WALLET_KEY_FILE ?? "").trim();
	const password = String(process.env.WALLET_PASSWORD ?? "").trim();
	if (!password) {
		throw new Error("Set WALLET_PASSWORD in environment, or import runWalletOpenDemo() and pass interact handler");
	}
	const discoveredFiles = await listLocalKeyFiles(storageKeyRoot);

	const interactHandler = async (request) => {
		if (request?.type === "wallet.file.select") {
			const choices = request?.fields?.[0]?.choices;
			if (keyFile) {
				const selectedByEnv = path.resolve(process.cwd(), keyFile);
				return { payload: { keyFilePath: selectedByEnv } };
			}
			const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0].value : discoveredFiles[0]?.abs;
			return { payload: { keyFilePath: firstChoice ?? "" } };
		}
		if (request?.type === "wallet.password.input") {
			return { payload: { password } };
		}
		return { payload: {} };
	};

	const data = await runWalletOpenDemo({ interact: interactHandler });
	console.log("Execution success:");
	console.log(JSON.stringify(data, null, 2));
}

function isRunAsEntry() {
	const current = fileURLToPath(import.meta.url);
	const entry = process.argv?.[1] ? path.resolve(process.argv[1]) : "";
	return current === entry;
}

if (isRunAsEntry()) {
	main().catch((error) => {
		console.error("Fatal:", error?.message ?? error);
		process.exitCode = 1;
	});
}


