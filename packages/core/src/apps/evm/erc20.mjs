import fsSync from "node:fs";
import path from "node:path";

import { Interface, formatUnits, getAddress, parseUnits } from "ethers";

import { resolveEvmNetProvider } from "./netprovider.mjs";
import { resolveEvmToken } from "./configs/tokens.js";
import { resolveEvmDeploymentDirs } from "./configs/deployments.js";
import { wrapEvmSignerAsEthersSigner } from "./provider.mjs";

const ERC20_ABI = [
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
	"function totalSupply() view returns (uint256)",
	"function balanceOf(address) view returns (uint256)",
	"function allowance(address,address) view returns (uint256)",
	"function approve(address,uint256) returns (bool)",
	"function transfer(address,uint256) returns (bool)",
	"function transferFrom(address,address,uint256) returns (bool)",
];

const ERC20_INTERFACE = new Interface(ERC20_ABI);

function isProviderLike(value) {
	return Boolean(value) && (
		typeof value.getBlockNumber === "function"
		|| typeof value.request === "function"
		|| typeof value.call === "function"
	);
}

function unwrapAdapterResult(value) {
	if (!value || typeof value !== "object") {
		return value;
	}
	if (value.ok === true && Object.prototype.hasOwnProperty.call(value, "result")) {
		return value.result;
	}
	return value;
}

function normalizeRunnerWithProvider(runner, provider) {
	if (!runner) {
		return provider ?? null;
	}

	if (typeof runner.sendTransaction === "function") {
		return wrapEvmSignerAsEthersSigner({ signer: runner, provider });
	}

	return runner;
}

function normalizeAddress(value, field = "address") {
	const raw = String(value ?? "").trim();
	if (!raw) {
		throw new Error(`${field} 不能为空`);
	}
	return getAddress(raw);
}

function toTimestamp(value) {
	const time = Date.parse(String(value ?? ""));
	return Number.isFinite(time) ? time : 0;
}

function readJsonSyncIfExists(filePath) {
	try {
		return JSON.parse(fsSync.readFileSync(filePath, "utf8"));
	} catch (error) {
		if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
			return null;
		}
		throw error;
	}
}

function loadDeploymentSync(chainId, input = {}) {
	const normalizedChainId = Number(chainId);
	if (!Number.isInteger(normalizedChainId) || normalizedChainId <= 0) {
		return null;
	}

	const dirs = resolveEvmDeploymentDirs(input);
	for (const dir of dirs) {
		const filePath = path.join(dir, `${normalizedChainId}.json`);
		const deployment = readJsonSyncIfExists(filePath);
		if (deployment) {
			return deployment;
		}
	}

	return null;
}

function resolveAddressFromDeploymentSync(tokenRef, input = {}) {
	const normalizedRef = String(tokenRef ?? "").trim();
	if (!normalizedRef) {
		return null;
	}

	const deployment = loadDeploymentSync(input.chainId, input);
	if (!deployment) {
		return null;
	}

	const tokenTable = deployment.tokens ?? {};
	const contractTables = [
		deployment.contracts ?? {},
		deployment.proxies ?? {},
	];
	const explicitDeploymentKey = String(input.deploymentKey ?? "").trim();
	const preferDirectContractKey = Boolean(explicitDeploymentKey) || normalizedRef.includes("#");

	const directToken = tokenTable[normalizedRef];
	if (directToken?.address) {
		return getAddress(String(directToken.address));
	}

	if (preferDirectContractKey) {
		for (const table of contractTables) {
			const direct = table[normalizedRef];
			if (direct?.address) {
				return getAddress(String(direct.address));
			}
		}
	}

	const candidates = [];
	for (const table of contractTables) {
		for (const [deploymentKey, record] of Object.entries(table)) {
			if (!record?.address) {
				continue;
			}
			if (String(record.contractName ?? "").trim() !== normalizedRef) {
				continue;
			}
			candidates.push({ deploymentKey, ...record });
		}
	}

	if (candidates.length === 0) {
		for (const table of contractTables) {
			const direct = table[normalizedRef];
			if (direct?.address) {
				return getAddress(String(direct.address));
			}
		}
		return null;
	}

	candidates.sort((a, b) => toTimestamp(b.updatedAt ?? b.createdAt) - toTimestamp(a.updatedAt ?? a.createdAt));
	return getAddress(String(candidates[0].address));
}

function resolveTokenContext(options = {}) {
	const tokenRef = String(
		options.token
		?? options.key
		?? options.symbol
		?? options.contractName
		?? options.deploymentKey
		?? options.address
		?? options.tokenAddress
		?? "",
	).trim();
	const explicitAddress = String(options.address ?? options.tokenAddress ?? "").trim();
	if (explicitAddress) {
		return {
			address: normalizeAddress(explicitAddress, "tokenAddress"),
			meta: null,
		};
	}

	if (!tokenRef) {
		throw new Error("token/address 不能为空");
	}

	try {
		return {
			address: normalizeAddress(tokenRef, "tokenAddress"),
			meta: null,
		};
	} catch {
		// ignore non-address token ref
	}

	try {
		const meta = resolveEvmToken({
			network: options.networkName ?? options.network ?? null,
			chainId: options.chainId,
			forkSourceChainId: options.forkSourceChainId,
			key: tokenRef,
		});
		return {
			address: normalizeAddress(meta.address, "tokenAddress"),
			meta,
		};
	} catch {
		// ignore and fallback to deployment records
	}

	const deploymentAddress = resolveAddressFromDeploymentSync(tokenRef, options);
	if (deploymentAddress) {
		return {
			address: deploymentAddress,
			meta: null,
		};
	}

	throw new Error(`未找到 EVM ERC20 token: ${tokenRef}`);
}

function resolveBaseProvider(options = {}) {
	if (isProviderLike(options.provider)) {
		return options.provider;
	}
	if (isProviderLike(options.runner) && typeof options.runner.sendTransaction !== "function") {
		return options.runner;
	}
	if (isProviderLike(options.runner?.provider)) {
		return options.runner.provider;
	}
	if (isProviderLike(options.signer?.provider)) {
		return options.signer.provider;
	}

	const networkRef = options.networkNameOrProvider
		?? options.netProvider
		?? options.networkName
		?? options.network
		?? null;
	if (!networkRef) {
		return null;
	}

	return resolveEvmNetProvider(networkRef, options).provider ?? null;
}

function normalizeAmountRaw(value) {
	return typeof value === "bigint" ? value : BigInt(String(value));
}

export function createErc20(options = {}) {
	const provider = resolveBaseProvider(options);
	const runner = normalizeRunnerWithProvider(options.runner ?? options.signer ?? provider, provider);
	const netProvider = resolveEvmNetProvider(
		options.networkNameOrProvider
		?? options.netProvider
		?? options.networkName
		?? options.network
		?? provider
		?? "fork",
		options,
	);
	const chainId = Number(options.chainId ?? netProvider.chainId);
	const networkName = String(options.networkName ?? options.network ?? netProvider.networkName ?? "fork").trim().toLowerCase();
	const tokenRes = resolveTokenContext({
		...options,
		chainId,
		networkName,
		forkSourceChainId: options.forkSourceChainId ?? netProvider.forkSourceChainId,
	});
	const contractAddress = tokenRes.address;
	const tokenName = String(options.tokenName ?? tokenRes.meta?.name ?? options.token ?? options.symbol ?? "ERC20").trim() || "ERC20";
	const symbolHint = String(options.symbolHint ?? tokenRes.meta?.symbol ?? "").trim().toUpperCase() || null;
	const decimalsHintRaw = options.decimalsHint ?? tokenRes.meta?.decimals;
	const decimalsHint = Number.isFinite(Number(decimalsHintRaw)) ? Number(decimalsHintRaw) : null;

	async function callRead(method, args = []) {
		if (!runner || typeof runner.call !== "function") {
			throw new Error(`ERC20 ${method} 需要 provider/runner.call`);
		}
		const tx = {
			to: contractAddress,
			data: ERC20_INTERFACE.encodeFunctionData(method, args),
		};
		const raw = unwrapAdapterResult(await runner.call(tx));
		const decoded = ERC20_INTERFACE.decodeFunctionResult(method, raw);
		return decoded[0];
	}

	async function callWrite(method, args = []) {
		if (!runner || typeof runner.sendTransaction !== "function") {
			throw new Error(`ERC20 ${method} 需要 signer/sendTransaction`);
		}
		const tx = {
			to: contractAddress,
			data: ERC20_INTERFACE.encodeFunctionData(method, args),
		};
		return unwrapAdapterResult(await runner.sendTransaction(tx));
	}

	async function resolveDecimals() {
		return decimalsHint ?? Number(await callRead("decimals"));
	}

	const api = {
		type: "erc20",
		tokenName,
		tokenAddress: contractAddress,
		address: contractAddress,
		runner,
		networkName,
		chainId,
		symbolHint,
		decimalsHint,
		connect(nextRunner) {
			return createErc20({
				...options,
				address: contractAddress,
				tokenName,
				runner: nextRunner,
				provider,
				networkNameOrProvider: options.networkNameOrProvider ?? netProvider,
			});
		},
		async name() {
			return callRead("name");
		},
		async symbol() {
			return callRead("symbol");
		},
		async decimals() {
			return resolveDecimals();
		},
		async totalSupply() {
			return callRead("totalSupply");
		},
		async totalSupplyHuman() {
			const decimals = await resolveDecimals();
			return formatUnits(await api.totalSupply(), decimals);
		},
		async balanceOf(owner) {
			return callRead("balanceOf", [normalizeAddress(owner, "owner")]);
		},
		async balanceOfHuman(owner) {
			const decimals = await resolveDecimals();
			return formatUnits(await api.balanceOf(owner), decimals);
		},
		async allowance(owner, spender) {
			return callRead("allowance", [
				normalizeAddress(owner, "owner"),
				normalizeAddress(spender, "spender"),
			]);
		},
		async approve(spender, amountRaw) {
			return callWrite("approve", [
				normalizeAddress(spender, "spender"),
				normalizeAmountRaw(amountRaw),
			]);
		},
		async approveHuman(spender, amount) {
			const decimals = await resolveDecimals();
			return api.approve(spender, parseUnits(String(amount), decimals));
		},
		async transfer(to, amountRaw) {
			return callWrite("transfer", [
				normalizeAddress(to, "to"),
				normalizeAmountRaw(amountRaw),
			]);
		},
		async transferHuman(to, amount) {
			const decimals = await resolveDecimals();
			return api.transfer(to, parseUnits(String(amount), decimals));
		},
		async transferFrom(from, to, amountRaw) {
			return callWrite("transferFrom", [
				normalizeAddress(from, "from"),
				normalizeAddress(to, "to"),
				normalizeAmountRaw(amountRaw),
			]);
		},
		async transferFromHuman(from, to, amount) {
			const decimals = await resolveDecimals();
			return api.transferFrom(from, to, parseUnits(String(amount), decimals));
		},
		async info(owner = null) {
			const decimals = await resolveDecimals();
			const summary = {
				type: "erc20",
				tokenName: await api.name().catch(() => tokenName),
				symbol: await api.symbol().catch(() => symbolHint),
				decimals,
				tokenAddress: contractAddress,
				totalSupply: await api.totalSupply().catch(() => null),
			};
			if (owner) {
				summary.balance = await api.balanceOf(owner);
				summary.balanceHuman = formatUnits(summary.balance, decimals);
			}
			return summary;
		},
	};

	return api;
}

export default {
	createErc20,
};