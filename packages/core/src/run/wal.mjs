import createWallet from "../apps/wallet/index.mjs";
import { execute, defineTask, createMutableRegistry } from "../execute/index.mjs";
import { interact, wallet } from "../execute/runtime.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function buildKeyFileChoices(fileItems = []) {
	return fileItems.map((item) => ({
		title: item.rel,
		value: item.abs,
		description: "encrypted key file",
	}));
}

const task = defineTask({
	id: TASK_ID,
	title: "Demo: prompt password and open wallet",
	async run() {
		const storageKeyRoot = path.resolve(process.cwd(), "storage/key");
		const localKeyFiles = await listLocalKeyFiles(storageKeyRoot);
		if (!localKeyFiles.length) {
			return {
				ok: true,
				loaded: 0,
				message: `No key files found in ${path.relative(process.cwd(), storageKeyRoot) || storageKeyRoot}`,
			};
		}

		const filePick = await interact({
			type: "wallet.file.select",
			message: "Select key file to unlock",
			fields: [
				{
					name: "keyFilePath",
					type: "select",
					message: "Select key file",
					required: true,
					choices: buildKeyFileChoices(localKeyFiles),
				},
			],
		});

		const selectedFilePath = String(filePick?.payload?.keyFilePath ?? localKeyFiles[0]?.abs ?? "").trim();
		if (!selectedFilePath) {
			throw new Error("Key file selection is required");
		}

		const passwordPick = await interact({
			type: "wallet.password.input",
			message: "Input password for selected key file",
			fields: [
				{
					name: "password",
					type: "password",
					message: "Wallet password",
					required: true,
					minLength: 1,
				},
			],
		});

		const password = String(passwordPick?.payload?.password ?? "").trim();
		if (!password) {
			throw new Error("Password is required");
		}

		await wallet.loadKeyFile({ file: selectedFilePath, password });
		const listed = await wallet.listKeys();

		if (!listed.items?.length) {
			return {
				ok: true,
				loaded: 0,
				keyFile: path.relative(process.cwd(), selectedFilePath) || selectedFilePath,
				message: "No keys loaded from selected file",
			};
		}

		const selected = listed.items[0];

		const unlocked = await wallet.unlock({
			keyId: selected.keyId,
			password,
			reason: "demo-open-wallet",
		});

		return {
			ok: true,
			loaded: listed.total,
			keyFile: path.relative(process.cwd(), selectedFilePath) || selectedFilePath,
			availableKeys: listed.items.map((item) => ({
				keyId: item.keyId,
				name: item.name,
				type: item.type,
				status: item.status,
			})),
			selectedKeyId: selected.keyId,
			selectedKeyName: selected.name,
			unlockedKeyId: selected.keyId,
			unlockedAt: unlocked.unlockedAt,
			expiresAt: unlocked.expiresAt,
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


