import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CORE_PACKAGE_DIR = path.resolve(MODULE_DIR, "../../../..");
const EVM_FORK_STATE_FILE = path.join(CORE_PACKAGE_DIR, ".runtime", "evm-fork.json");

function normalizeForkState(input = {}) {
	return {
		sourceNetwork: String(input.sourceNetwork ?? "").trim().toLowerCase(),
		sourceChainId: Number.isInteger(Number(input.sourceChainId)) ? Number(input.sourceChainId) : null,
		sourceRpcUrl: String(input.sourceRpcUrl ?? "").trim(),
		localRpcUrl: String(input.localRpcUrl ?? "").trim(),
		localChainId: Number.isInteger(Number(input.localChainId)) ? Number(input.localChainId) : 31337,
		blockNumber: Number.isInteger(Number(input.blockNumber)) ? Number(input.blockNumber) : null,
		createdAt: String(input.createdAt ?? new Date().toISOString()).trim(),
	};
}

export function getEvmForkStateFile() {
	return EVM_FORK_STATE_FILE;
}

export function readEvmForkStateSync() {
	try {
		if (!fs.existsSync(EVM_FORK_STATE_FILE)) return null;
		const text = fs.readFileSync(EVM_FORK_STATE_FILE, "utf8");
		if (!text.trim()) return null;
		return normalizeForkState(JSON.parse(text));
	} catch {
		return null;
	}
}

export async function writeEvmForkState(input = {}) {
	const state = normalizeForkState(input);
	await fs.promises.mkdir(path.dirname(EVM_FORK_STATE_FILE), { recursive: true });
	await fs.promises.writeFile(EVM_FORK_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
	return state;
}

export async function clearEvmForkState() {
	try {
		await fs.promises.unlink(EVM_FORK_STATE_FILE);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
}
