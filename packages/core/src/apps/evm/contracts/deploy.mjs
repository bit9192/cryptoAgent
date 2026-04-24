import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Contract, ContractFactory, Interface, JsonRpcProvider, Wallet } from "ethers";
import solc from "solc";

import { compileContracts } from "../../../../contracts/compile.mjs";
import { loadContractArtifact } from "./load.mjs";
import { listDeploymentRecords, getDeploymentRecord, upsertDeploymentRecord } from "./deployment-registry.mjs";
import { resolveEvmNetProvider } from "../netprovider.mjs";
import { wrapEvmSignerAsEthersSigner } from "../provider.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_ROOT_DIR = path.resolve(MODULE_DIR, "../../../../contracts");
const LOCAL_ARTIFACTS_DIR = path.join(CONTRACTS_ROOT_DIR, "artifacts");
const DEFAULT_LOCAL_DEPLOYER_PRIVATE_KEY = String(
	process.env.EVM_DEPLOY_PRIVATE_KEY
	?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
).trim();
const MULTICALL_REQUEST_SYMBOL = Symbol.for("contractHelper.multicallRequest");
let proxyArtifactsPromise = null;

function unwrapAdapterResult(value) {
	if (!value || typeof value !== "object") {
		return value;
	}
	if (value.ok === true && Object.prototype.hasOwnProperty.call(value, "result")) {
		return value.result;
	}
	return value;
}

function wrapFunctionResult(fn, owner) {
	if (typeof fn !== "function") {
		return fn;
	}
	return async (...args) => unwrapAdapterResult(await fn.apply(owner, args));
}

function adaptRunner(runner, fallbackProvider = null) {
	if (!runner || typeof runner !== "object") {
		return fallbackProvider ?? runner;
	}

	const provider = runner.provider ?? fallbackProvider ?? null;
	return new Proxy(runner, {
		get(target, prop, receiver) {
			if (prop === "provider") {
				return provider;
			}

			if (Reflect.has(target, prop)) {
				const own = Reflect.get(target, prop, receiver);
				return wrapFunctionResult(own, target);
			}

			if (provider && Reflect.has(provider, prop)) {
				const delegated = Reflect.get(provider, prop, provider);
				return typeof delegated === "function" ? delegated.bind(provider) : delegated;
			}

			return undefined;
		},
	});
}

function buildCallRequest(contract, method, args) {
	const fragment = contract.interface.getFunction(method);
	return {
		target: contract.target,
		iface: contract.interface,
		fragment,
		args,
		callData: contract.interface.encodeFunctionData(fragment, args),
		[MULTICALL_REQUEST_SYMBOL]: true,
	};
}

export class EvmContract extends Contract {
	constructor(target, abi, runner) {
		super(target, abi, adaptRunner(runner));
	}

	get address() {
		return String(this.target);
	}

	get calls() {
		if (!this._callsProxy) {
			this._callsProxy = new Proxy({}, {
				get: (_target, prop) => {
					if (typeof prop !== "string") {
						return undefined;
					}
					return (...args) => buildCallRequest(this, prop, args);
				},
			});
		}
		return this._callsProxy;
	}

	connect(nextRunner) {
		const baseProvider = this.runner?.provider ?? this.runner ?? null;
		return new EvmContract(this.target, this.interface.fragments, adaptRunner(nextRunner, baseProvider));
	}
}

function resolveRunner(options = {}) {
	if (options.signer) {
		return wrapEvmSignerAsEthersSigner({
			signer: options.signer,
			provider: options.provider,
			rpc: options.rpcUrl ?? options.rpc,
			options,
		});
	}
	if (options.runner) {
		return adaptRunner(options.runner, options.runner.provider ?? null);
	}
	if (options.provider) {
		return options.provider;
	}
	if (options.rpcUrl || options.rpc) {
		return new JsonRpcProvider(String(options.rpcUrl ?? options.rpc));
	}

	const networkRef = options.networkNameOrProvider
		?? options.netProvider
		?? options.networkName
		?? options.network
		?? null;
	if (!networkRef) {
		return null;
	}

	const resolved = resolveEvmNetProvider(networkRef, options);
	if (resolved?.provider && resolved?.isLocal) {
		return new Wallet(DEFAULT_LOCAL_DEPLOYER_PRIVATE_KEY, resolved.provider);
	}
	return resolved?.provider ?? null;
}

function makeImportCallback(ozPath) {
	return (importPath) => {
		try {
			// Handle @openzeppelin/contracts imports
			if (importPath.startsWith("@openzeppelin/contracts/")) {
				const actualPath = importPath.replace("@openzeppelin/contracts/", "");
				const fullPath = path.join(ozPath, actualPath);
				const content = readFileSync(fullPath, "utf8");
				return { contents: content };
			}
			return { error: `Import not found: ${importPath}` };
		} catch (err) {
			return { error: `Cannot read import: ${importPath}` };
		}
	};
}

function compileWithOpenZeppelin(contractCode, contractNames, sourceFileName = "Contracts.sol") {
	const OZ_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../node_modules/@openzeppelin/contracts");
	
	const input = {
		language: "Solidity",
		sources: {
			[sourceFileName]: {
				content: contractCode,
			},
		},
		settings: {
			optimizer: { enabled: true, runs: 200 },
			outputSelection: {
				"*": {
					"*": ["abi", "evm.bytecode.object"],
				},
			},
		},
	};
	
	// Use findImports callback for import resolution
	const output = JSON.parse(solc.compile(JSON.stringify(input), { import: makeImportCallback(OZ_PATH) }));
	const errors = Array.isArray(output?.errors) ? output.errors.filter((item) => String(item?.severity ?? "").toLowerCase() === "error") : [];
	if (errors.length > 0) {
		throw new Error(`proxy helper 编译失败: ${errors[0].formattedMessage ?? errors[0].message ?? "unknown"}`);
	}
	const compiled = output?.contracts?.[sourceFileName] ?? {};
	return Object.fromEntries(contractNames.map((name) => [
		name,
		{
			abi: compiled?.[name]?.abi ?? [],
			bytecode: compiled?.[name]?.evm?.bytecode?.object ? `0x${compiled[name].evm.bytecode.object}` : "0x",
		},
	]));
}

async function loadProxyArtifacts() {
	if (!proxyArtifactsPromise) {
		proxyArtifactsPromise = Promise.resolve().then(() => compileWithOpenZeppelin(`
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
		`, ["TransparentUpgradeableProxy", "ProxyAdmin"], "OzProxyContracts.sol"));
	}
	return await proxyArtifactsPromise;
}

async function findArtifactByName(rootDir, contractName) {
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			const nested = await findArtifactByName(fullPath, contractName);
			if (nested) {
				return nested;
			}
			continue;
		}
		if (!entry.isFile() || entry.name !== `${contractName}.json`) {
			continue;
		}
		const parsed = JSON.parse(await fs.readFile(fullPath, "utf8"));
		if (String(parsed?.contractName ?? "").trim() === contractName) {
			return {
				artifactPath: fullPath,
				artifact: parsed,
			};
		}
	}
	return null;
}

async function loadArtifactWithAutoCompile(contractName, options = {}) {
	try {
		return await loadContractArtifact({
			contractName,
			sourceName: options.sourceName,
			manifestPath: options.manifestPath,
		});
	} catch (error) {
		const localArtifact = await findArtifactByName(LOCAL_ARTIFACTS_DIR, contractName).catch(() => null);
		if (localArtifact) {
			return localArtifact;
		}
		if (!options.autoCompile) {
			throw error;
		}

		try {
			await compileContracts({
				profile: String(options.compileProfile ?? "all"),
				quiet: Boolean(options.compileQuiet ?? true),
			});
		} catch {
			// 编译失败时保留后续本地 artifact 查找和空 ABI 兜底
		}

		try {
			return await loadContractArtifact({
				contractName,
				sourceName: options.sourceName,
				manifestPath: options.manifestPath,
			});
		} catch {
			const fallbackArtifact = await findArtifactByName(LOCAL_ARTIFACTS_DIR, contractName).catch(() => null);
			if (fallbackArtifact) {
				return fallbackArtifact;
			}
			return {
				artifact: {
					contractName,
					abi: [],
					bytecode: "0x",
				},
			};
		}
	}
}

async function resolveRegisteredAddress(contractName, options = {}) {
	const kinds = options.kind ? [String(options.kind)] : ["proxies", "contracts", "tokens"];
	const deploymentKey = String(options.deploymentKey ?? "").trim();

	for (const kind of kinds) {
		if (deploymentKey) {
			const found = await getDeploymentRecord({
				...options,
				kind,
				deploymentKey,
			});
			if (found?.foundRecord && found.record?.address) {
				return String(found.record.address);
			}
			continue;
		}

		const listed = await listDeploymentRecords({
			...options,
			kind,
		});
		const candidates = listed.items
			.filter((item) => String(item?.contractName ?? "").trim() === contractName)
			.filter((item) => String(item?.address ?? "").trim());
		if (candidates.length === 0) {
			continue;
		}

		candidates.sort((a, b) => Date.parse(String(b.updatedAt ?? b.createdAt ?? 0)) - Date.parse(String(a.updatedAt ?? a.createdAt ?? 0)));
		return String(candidates[0].address);
	}

	throw new Error(`未找到已部署合约地址: ${contractName}`);
}

export async function getContract(contractName, address = null, options = {}) {
	const normalizedName = String(contractName ?? "").trim();
	if (!normalizedName) {
		throw new Error("contractName 不能为空");
	}

	const { artifact } = await loadArtifactWithAutoCompile(normalizedName, options);
	const resolvedAddress = String(address ?? "").trim() || await resolveRegisteredAddress(normalizedName, options);
	const runner = resolveRunner(options);

	return new EvmContract(resolvedAddress, artifact?.abi ?? [], runner);
}

async function resolveChainId(options = {}, runner = null) {
	if (Number.isInteger(Number(options.chainId)) && Number(options.chainId) > 0) {
		return Number(options.chainId);
	}
	const runnerProvider = runner?.provider ?? null;
	if (runnerProvider && typeof runnerProvider.getNetwork === "function") {
		const net = await runnerProvider.getNetwork();
		const chainId = Number(net?.chainId ?? 0);
		if (Number.isInteger(chainId) && chainId > 0) {
			return chainId;
		}
	}
	const networkRef = options.networkNameOrProvider
		?? options.netProvider
		?? options.networkName
		?? options.network
		?? null;
	if (networkRef) {
		return Number(resolveEvmNetProvider(networkRef, options).chainId);
	}
	throw new Error("无法解析 chainId");
}

async function nextDeploymentKey(contractName, options = {}) {
	const listed = await listDeploymentRecords({
		...options,
		kind: String(options.kind ?? "contracts"),
	});
	const keys = listed.items
		.filter((item) => String(item?.contractName ?? "").trim() === contractName)
		.map((item) => String(item?.deploymentKey ?? "").trim())
		.filter(Boolean);
	if (!keys.includes(contractName)) {
		return contractName;
	}
	let maxSuffix = 1;
	for (const key of keys) {
		const match = key.match(new RegExp(`^${contractName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#(\\d+)$`));
		if (!match) continue;
		maxSuffix = Math.max(maxSuffix, Number(match[1]));
	}
	return `${contractName}#${maxSuffix + 1}`;
}

export async function deploy(contractName, args = [], options = {}) {
	const normalizedName = String(contractName ?? "").trim();
	if (!normalizedName) {
		throw new Error("contractName 不能为空");
	}
	const ctorArgs = Array.isArray(args) ? args : [];
	const { artifact } = await loadArtifactWithAutoCompile(normalizedName, { ...options, autoCompile: true });
	const abi = Array.isArray(artifact?.abi) ? artifact.abi : [];
	const bytecode = String(artifact?.bytecode ?? "").trim();
	if (!bytecode || bytecode === "0x") {
		throw new Error(`合约缺少可部署 bytecode: ${normalizedName}`);
	}
	const runner = resolveRunner(options);
	if (!runner || typeof runner.sendTransaction !== "function") {
		throw new Error("deploy 需要可写 signer");
	}

	const factory = new ContractFactory(abi, bytecode, runner);
	const deployed = await factory.deploy(...ctorArgs);
	await deployed.waitForDeployment();
	const address = await deployed.getAddress();
	const deploymentTx = typeof deployed.deploymentTransaction === "function" ? deployed.deploymentTransaction() : null;
	const chainId = await resolveChainId(options, runner);
	const deploymentKey = String(options.deploymentKey ?? "").trim() || await nextDeploymentKey(normalizedName, {
		...options,
		chainId,
	});

	await upsertDeploymentRecord({
		chainId,
		deploymentDirs: options.deploymentDirs,
		networkName: options.networkName,
		network: options.network,
		kind: "contracts",
		deploymentKey,
		record: {
			contractName: normalizedName,
			address,
			txHash: deploymentTx?.hash ?? null,
			sourceName: String(artifact?.sourceName ?? "").trim() || null,
		},
	});

	return {
		ok: true,
		contractName: normalizedName,
		deploymentKey,
		chainId,
		address,
		txHash: deploymentTx?.hash ?? null,
		contract: new EvmContract(address, abi, runner),
	};
}

function encodeInitializerCall(abi, args) {
	const iface = new Interface(abi);
	try {
		return iface.encodeFunctionData("initialize", Array.isArray(args) ? args : []);
	} catch {
		return "0x";
	}
}

async function deployProxyHelpers(runner) {
	const artifacts = await loadProxyArtifacts();
	const adminFactory = new ContractFactory(artifacts.ProxyAdmin.abi, artifacts.ProxyAdmin.bytecode, runner);
	const proxyAdmin = await adminFactory.deploy();
	await proxyAdmin.waitForDeployment();
	return {
		artifacts,
		proxyAdmin,
		proxyAdminAddress: await proxyAdmin.getAddress(),
	};
}

export async function deployProxy(contractName, args = [], options = {}) {
	const normalizedKind = String(options.kind ?? "transparent").trim().toLowerCase();
	if (normalizedKind !== "transparent") {
		throw new Error(`暂不支持的 proxy kind: ${normalizedKind}`);
	}
	const { artifact } = await loadArtifactWithAutoCompile(String(contractName ?? "").trim(), { ...options, autoCompile: true });
	const implAbi = Array.isArray(artifact?.abi) ? artifact.abi : [];
	const implDeploy = await deploy(contractName, [], options);
	const runner = resolveRunner(options);
	if (!runner || typeof runner.sendTransaction !== "function") {
		throw new Error("deployProxy 需要可写 signer");
	}
	const chainId = await resolveChainId(options, runner);
	const deploymentKey = String(options.deploymentKey ?? "").trim() || await nextDeploymentKey(String(contractName ?? "").trim(), {
		...options,
		chainId,
		kind: "proxies",
	});
	const initData = encodeInitializerCall(implAbi, args);
	const { artifacts, proxyAdminAddress } = await deployProxyHelpers(runner);
	const proxyFactory = new ContractFactory(artifacts.TransparentUpgradeableProxy.abi, artifacts.TransparentUpgradeableProxy.bytecode, runner);
	const proxy = await proxyFactory.deploy(implDeploy.address, proxyAdminAddress, initData);
	await proxy.waitForDeployment();
	const proxyAddress = await proxy.getAddress();

	await upsertDeploymentRecord({
		chainId,
		deploymentDirs: options.deploymentDirs,
		networkName: options.networkName,
		network: options.network,
		kind: "proxies",
		deploymentKey,
		record: {
			contractName: String(contractName ?? "").trim(),
			address: proxyAddress,
			admin: proxyAdminAddress,
			implementation: implDeploy.address,
			history: [
				{
					contractName: String(contractName ?? "").trim(),
					implementation: implDeploy.address,
					updatedAt: new Date().toISOString(),
				},
			],
		},
	});

	return {
		ok: true,
		chainId,
		deploymentKey,
		proxyAddress,
		address: proxyAddress,
		implementationAddress: implDeploy.address,
		proxyAdminAddress,
		contract: new EvmContract(proxyAddress, implAbi, runner),
	};
}

export async function upProxy(contractName, proxyAddress, options = {}) {
	const normalizedKind = String(options.kind ?? "transparent").trim().toLowerCase();
	if (normalizedKind !== "transparent") {
		throw new Error(`暂不支持的 proxy kind: ${normalizedKind}`);
	}
	const runner = resolveRunner(options);
	if (!runner || typeof runner.sendTransaction !== "function") {
		throw new Error("upProxy 需要可写 signer");
	}
	const chainId = await resolveChainId(options, runner);
	const listed = await listDeploymentRecords({
		...options,
		chainId,
		kind: "proxies",
	});
	const current = listed.items.find((item) => String(item?.address ?? "").toLowerCase() === String(proxyAddress ?? "").toLowerCase());
	if (!current) {
		throw new Error(`未找到 proxy 记录: ${proxyAddress}`);
	}
	const { artifact } = await loadArtifactWithAutoCompile(String(contractName ?? "").trim(), { ...options, autoCompile: true });
	const implDeploy = await deploy(contractName, [], options);
	const artifacts = await loadProxyArtifacts();
	const proxyAdmin = new EvmContract(String(current.admin), artifacts.ProxyAdmin.abi, runner);
	const tx = await proxyAdmin.upgradeAndCall(String(proxyAddress), implDeploy.address, "0x");
	await tx.wait();
	const nextHistory = [
		...(Array.isArray(current.history) ? current.history : []),
		{
			contractName: String(contractName ?? "").trim(),
			implementation: implDeploy.address,
			updatedAt: new Date().toISOString(),
		},
	];
	await upsertDeploymentRecord({
		chainId,
		deploymentDirs: options.deploymentDirs,
		networkName: options.networkName,
		network: options.network,
		kind: "proxies",
		deploymentKey: String(current.deploymentKey),
		record: {
			contractName: String(contractName ?? "").trim(),
			address: String(proxyAddress),
			admin: String(current.admin),
			implementation: implDeploy.address,
			history: nextHistory,
		},
	});

	return {
		ok: true,
		chainId,
		deploymentKey: String(current.deploymentKey),
		proxyAddress: String(proxyAddress),
		address: String(proxyAddress),
		implementationAddress: implDeploy.address,
		contract: new EvmContract(String(proxyAddress), Array.isArray(artifact?.abi) ? artifact.abi : [], runner),
	};
}

export default deploy;
