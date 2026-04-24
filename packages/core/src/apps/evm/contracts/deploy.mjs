import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Contract, ContractFactory, Interface, JsonRpcProvider, NonceManager, Wallet } from "ethers";
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
const VALID_REGISTRY_KINDS = new Set(["contracts", "proxies", "tokens"]);
const LOCAL_NONCE_RUNNER_CACHE = new Map();
const PROXY_ARTIFACT_NAMES = ["TransparentUpgradeableProxy", "ProxyAdmin"];
const PROXY_CONTRACTS_SOURCE = `
pragma solidity ^0.8.0;

contract TransparentUpgradeableProxy {
	bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
	bytes32 private constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

	constructor(address _logic, address admin_, bytes memory _data) payable {
		assembly {
			sstore(IMPLEMENTATION_SLOT, _logic)
			sstore(ADMIN_SLOT, admin_)
		}
		if (_data.length > 0) {
			(bool ok, bytes memory reason) = _logic.delegatecall(_data);
			if (!ok) {
				if (reason.length > 0) {
					assembly { revert(add(reason, 32), mload(reason)) }
				}
				revert("init failed");
			}
		}
	}

	function implementation() external view returns (address impl) {
		assembly { impl := sload(IMPLEMENTATION_SLOT) }
	}

	function admin() external view returns (address adm) {
		assembly { adm := sload(ADMIN_SLOT) }
	}

	function upgradeToAndCall(address newImplementation, bytes calldata data) external payable {
		address adm;
		assembly { adm := sload(ADMIN_SLOT) }
		require(msg.sender == adm, "admin only");
		assembly { sstore(IMPLEMENTATION_SLOT, newImplementation) }
		if (data.length > 0) {
			(bool ok, bytes memory reason) = newImplementation.delegatecall(data);
			if (!ok) {
				if (reason.length > 0) {
					assembly { revert(add(reason, 32), mload(reason)) }
				}
				revert("upgrade call failed");
			}
		}
	}

	fallback() external payable { _fallback(); }
	receive() external payable { _fallback(); }

	function _fallback() internal {
		address adm;
		assembly { adm := sload(ADMIN_SLOT) }
		require(msg.sender != adm, "admin cannot fallback");
		address impl;
		assembly { impl := sload(IMPLEMENTATION_SLOT) }
		assembly {
			calldatacopy(0, 0, calldatasize())
			let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
			returndatacopy(0, 0, returndatasize())
			switch result
			case 0 { revert(0, returndatasize()) }
			default { return(0, returndatasize()) }
		}
	}
}

contract ProxyAdmin {
	address public owner;

	constructor() {
		owner = msg.sender;
	}

	modifier onlyOwner() {
		require(msg.sender == owner, "owner only");
		_;
	}

	function upgradeAndCall(address proxy, address implementation, bytes calldata data) external payable onlyOwner {
		TransparentUpgradeableProxy(payable(proxy)).upgradeToAndCall{ value: msg.value }(implementation, data);
	}
}
`;
let proxyArtifactsPromise = null;

function normalizeContractName(contractName, label = "contractName") {
	const normalized = String(contractName ?? "").trim();
	if (!normalized) {
		throw new Error(`${label} 不能为空`);
	}
	return normalized;
}

function resolveRegistryKind(kind, fallback = "contracts") {
	const normalized = String(kind ?? "").trim();
	if (VALID_REGISTRY_KINDS.has(normalized)) {
		return normalized;
	}
	return fallback;
}

function deploymentKeyRank(contractName, deploymentKey) {
	const base = String(contractName ?? "").trim();
	const key = String(deploymentKey ?? "").trim();
	if (!base || !key) {
		return 0;
	}
	if (key === base) {
		return 1;
	}
	const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = key.match(new RegExp(`^${escaped}#(\\d+)$`));
	if (!match) {
		return 0;
	}
	return Number.parseInt(match[1], 10) || 0;
}

function ensureWritableRunner(options = {}, action = "deploy") {
	const runner = resolveRunner(options);
	if (!runner || typeof runner.sendTransaction !== "function") {
		throw new Error(`${action} 需要可写 signer`);
	}
	return runner;
}

function normalizeCallArgs(args) {
	return Array.isArray(args) ? args : [];
}

function ensureDeployableBytecode(contractName, bytecode) {
	if (!bytecode || bytecode === "0x") {
		throw new Error(`合约缺少可部署 bytecode: ${contractName}`);
	}
}

function toDeployResult({ contractName, deploymentKey, chainId, address, txHash, abi, runner }) {
	return {
		ok: true,
		contractName,
		deploymentKey,
		chainId,
		address,
		txHash,
		contract: new EvmContract(address, abi, runner),
	};
}

function resolveLocalNonceRunner(provider, cacheKey) {
	const key = String(cacheKey ?? "hardhat");
	if (!LOCAL_NONCE_RUNNER_CACHE.has(key)) {
		const wallet = new Wallet(DEFAULT_LOCAL_DEPLOYER_PRIVATE_KEY, provider);
		LOCAL_NONCE_RUNNER_CACHE.set(key, new NonceManager(wallet));
	}
	return LOCAL_NONCE_RUNNER_CACHE.get(key);
}

function resolveNetworkRef(options = {}) {
	return options.networkNameOrProvider
		?? options.netProvider
		?? options.networkName
		?? options.network
		?? null;
}

function sortDeploymentCandidates(contractName, candidates = []) {
	return candidates.sort((a, b) => {
		const timeA = Date.parse(String(a.updatedAt ?? a.createdAt ?? 0));
		const timeB = Date.parse(String(b.updatedAt ?? b.createdAt ?? 0));
		if (timeB !== timeA) {
			return timeB - timeA;
		}
		const rankA = deploymentKeyRank(contractName, a.deploymentKey);
		const rankB = deploymentKeyRank(contractName, b.deploymentKey);
		if (rankB !== rankA) {
			return rankB - rankA;
		}
		return String(b.deploymentKey ?? "").localeCompare(String(a.deploymentKey ?? ""));
	});
}

function parsePositiveChainId(value) {
	const chainId = Number(value ?? 0);
	return Number.isInteger(chainId) && chainId > 0 ? chainId : null;
}

async function resolveChainIdFromRunner(runner) {
	const runnerProvider = runner?.provider ?? null;
	if (!runnerProvider || typeof runnerProvider.getNetwork !== "function") {
		return null;
	}
	const net = await runnerProvider.getNetwork();
	return parsePositiveChainId(net?.chainId);
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

function compileContractsFromSource(sourceName, sourceCode, contractNames) {
	const input = {
		language: "Solidity",
		sources: {
			[sourceName]: { content: sourceCode },
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

	const output = JSON.parse(solc.compile(JSON.stringify(input)));
	const errors = Array.isArray(output?.errors)
		? output.errors.filter((item) => String(item?.severity ?? "").toLowerCase() === "error")
		: [];
	if (errors.length > 0) {
		throw new Error(`proxy helper 编译失败: ${errors[0].formattedMessage ?? errors[0].message ?? "unknown"}`);
	}

	const compiled = output?.contracts?.[sourceName] ?? {};
	return Object.fromEntries(contractNames.map((name) => [
		name,
		{
			abi: compiled?.[name]?.abi ?? [],
			bytecode: compiled?.[name]?.evm?.bytecode?.object ? `0x${compiled[name].evm.bytecode.object}` : "0x",
		},
	]));
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

	const networkRef = resolveNetworkRef(options);
	if (!networkRef) {
		return null;
	}

	const resolved = resolveEvmNetProvider(networkRef, options);
	if (resolved?.provider && resolved?.isLocal) {
		const chainId = Number(resolved?.chainId ?? 0);
		const cacheKey = `${String(networkRef)}:${Number.isInteger(chainId) && chainId > 0 ? chainId : "local"}`;
		return resolveLocalNonceRunner(resolved.provider, cacheKey);
	}
	return resolved?.provider ?? null;
}

function compileInlineProxyContracts(contractNames) {
	return compileContractsFromSource("ProxyContracts.sol", PROXY_CONTRACTS_SOURCE, contractNames);
}

async function loadProxyArtifacts() {
	if (!proxyArtifactsPromise) {
		proxyArtifactsPromise = Promise.resolve().then(() => compileInlineProxyContracts(PROXY_ARTIFACT_NAMES));
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

async function tryLoadManifestArtifact(contractName, options = {}) {
	try {
		return await loadContractArtifact({
			contractName,
			sourceName: options.sourceName,
			manifestPath: options.manifestPath,
		});
	} catch {
		return null;
	}
}

async function tryLoadLocalArtifact(contractName) {
	return await findArtifactByName(LOCAL_ARTIFACTS_DIR, contractName).catch(() => null);
}

async function loadArtifactWithAutoCompile(contractName, options = {}) {
	const fromManifest = await tryLoadManifestArtifact(contractName, options);
	if (fromManifest) {
		return fromManifest;
	}

	const fromLocal = await tryLoadLocalArtifact(contractName);
	if (fromLocal) {
		return fromLocal;
	}

	if (!options.autoCompile) {
		throw new Error(`未找到 artifact: ${contractName}`);
	}

	try {
		await compileContracts({
			profile: String(options.compileProfile ?? "all"),
			quiet: Boolean(options.compileQuiet ?? true),
		});
	} catch {
		// 编译失败时保留后续本地 artifact 查找和空 ABI 兜底
	}

	const afterCompileManifest = await tryLoadManifestArtifact(contractName, options);
	if (afterCompileManifest) {
		return afterCompileManifest;
	}

	const afterCompileLocal = await tryLoadLocalArtifact(contractName);
	if (afterCompileLocal) {
		return afterCompileLocal;
	}

	return {
		artifact: {
			contractName,
			abi: [],
			bytecode: "0x",
		},
	};
}

async function resolveRegisteredAddress(contractName, options = {}) {
	const kinds = options.kind
		? [resolveRegistryKind(options.kind, "contracts")]
		: ["proxies", "contracts", "tokens"];
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

		sortDeploymentCandidates(contractName, candidates);
		return String(candidates[0].address);
	}

	throw new Error(`未找到已部署合约地址: ${contractName}`);
}

export async function getContract(contractName, address = null, options = {}) {
	const normalizedName = normalizeContractName(contractName);

	const { artifact } = await loadArtifactWithAutoCompile(normalizedName, options);
	const resolvedAddress = String(address ?? "").trim() || await resolveRegisteredAddress(normalizedName, options);
	const runner = resolveRunner(options);

	return new EvmContract(resolvedAddress, artifact?.abi ?? [], runner);
}

async function resolveChainId(options = {}, runner = null) {
	const explicitChainId = parsePositiveChainId(options.chainId);
	if (explicitChainId) {
		return explicitChainId;
	}
	const chainIdFromRunner = await resolveChainIdFromRunner(runner);
	if (chainIdFromRunner) {
		return chainIdFromRunner;
	}
	const networkRef = resolveNetworkRef(options);
	if (networkRef) {
		return Number(resolveEvmNetProvider(networkRef, options).chainId);
	}
	throw new Error("无法解析 chainId");
}

async function nextDeploymentKey(contractName, options = {}) {
	const listed = await listDeploymentRecords({
		...options,
		kind: resolveRegistryKind(options.kind, "contracts"),
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
	const normalizedName = normalizeContractName(contractName);
	const ctorArgs = normalizeCallArgs(args);
	const kind = resolveRegistryKind(options.kind, "contracts");
	const { artifact } = await loadArtifactWithAutoCompile(normalizedName, { ...options, autoCompile: true });
	const abi = Array.isArray(artifact?.abi) ? artifact.abi : [];
	const bytecode = String(artifact?.bytecode ?? "").trim();
	ensureDeployableBytecode(normalizedName, bytecode);
	const runner = ensureWritableRunner(options, "deploy");

	const factory = new ContractFactory(abi, bytecode, runner);
	const deployed = await factory.deploy(...ctorArgs);
	await deployed.waitForDeployment();
	const address = await deployed.getAddress();
	const deploymentTx = typeof deployed.deploymentTransaction === "function" ? deployed.deploymentTransaction() : null;
	const chainId = await resolveChainId(options, runner);
	const deploymentKey = String(options.deploymentKey ?? "").trim() || await nextDeploymentKey(normalizedName, {
		...options,
		chainId,
		kind,
	});

	await upsertDeploymentRecord({
		chainId,
		deploymentDirs: options.deploymentDirs,
		networkName: options.networkName,
		network: options.network,
		kind,
		deploymentKey,
		record: {
			contractName: normalizedName,
			address,
			txHash: deploymentTx?.hash ?? null,
			sourceName: String(artifact?.sourceName ?? "").trim() || null,
		},
	});

	return toDeployResult({
		contractName: normalizedName,
		deploymentKey,
		chainId,
		address,
		txHash: deploymentTx?.hash ?? null,
		abi,
		runner,
	});
}

function encodeInitializerCall(abi, args) {
	const iface = new Interface(abi);
	try {
		return iface.encodeFunctionData("initialize", Array.isArray(args) ? args : []);
	} catch {
		return "0x";
	}
}

function ensureTransparentProxyKind(options = {}) {
	const normalizedKind = String(options.kind ?? "transparent").trim().toLowerCase();
	if (normalizedKind !== "transparent") {
		throw new Error(`暂不支持的 proxy kind: ${normalizedKind}`);
	}
}

function createProxyHistoryEntry(contractName, implementationAddress) {
	return {
		contractName,
		implementation: implementationAddress,
		updatedAt: new Date().toISOString(),
	};
}

async function getProxyRecordByAddress(proxyAddress, options = {}, chainId) {
	const listed = await listDeploymentRecords({
		...options,
		chainId,
		kind: "proxies",
	});
	const normalizedProxyAddress = String(proxyAddress ?? "").toLowerCase();
	return listed.items.find((item) => String(item?.address ?? "").toLowerCase() === normalizedProxyAddress) ?? null;
}

async function saveProxyRecord({ chainId, deploymentKey, contractName, proxyAddress, proxyAdminAddress, implementationAddress, history }, options = {}) {
	await upsertDeploymentRecord({
		chainId,
		deploymentDirs: options.deploymentDirs,
		networkName: options.networkName,
		network: options.network,
		kind: "proxies",
		deploymentKey,
		record: {
			contractName,
			address: String(proxyAddress),
			admin: String(proxyAdminAddress),
			implementation: implementationAddress,
			history,
		},
	});
}

function toProxyResult({ chainId, deploymentKey, proxyAddress, implementationAddress, proxyAdminAddress = null, abi = [], runner }) {
	return {
		ok: true,
		chainId,
		deploymentKey,
		proxyAddress,
		address: proxyAddress,
		implementationAddress,
		...(proxyAdminAddress ? { proxyAdminAddress } : {}),
		contract: new EvmContract(proxyAddress, abi, runner),
	};
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
	ensureTransparentProxyKind(options);
	const normalizedName = normalizeContractName(contractName);
	const { artifact } = await loadArtifactWithAutoCompile(normalizedName, { ...options, autoCompile: true });
	const implAbi = Array.isArray(artifact?.abi) ? artifact.abi : [];
	const implDeploy = await deploy(normalizedName, [], { ...options, kind: "contracts" });
	const runner = ensureWritableRunner(options, "deployProxy");
	const chainId = await resolveChainId(options, runner);
	const deploymentKey = String(options.deploymentKey ?? "").trim() || await nextDeploymentKey(normalizedName, {
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
	const history = [createProxyHistoryEntry(normalizedName, implDeploy.address)];

	await saveProxyRecord({
		chainId,
		deploymentKey,
		contractName: normalizedName,
		proxyAddress,
		proxyAdminAddress,
		implementationAddress: implDeploy.address,
		history,
	}, options);

	return toProxyResult({
		chainId,
		deploymentKey,
		proxyAddress,
		implementationAddress: implDeploy.address,
		proxyAdminAddress,
		abi: implAbi,
		runner,
	});
}

export async function upProxy(contractName, proxyAddress, options = {}) {
	ensureTransparentProxyKind(options);
	const normalizedName = normalizeContractName(contractName);
	const runner = ensureWritableRunner(options, "upProxy");
	const chainId = await resolveChainId(options, runner);
	const current = await getProxyRecordByAddress(proxyAddress, options, chainId);
	if (!current) {
		throw new Error(`未找到 proxy 记录: ${proxyAddress}`);
	}
	const { artifact } = await loadArtifactWithAutoCompile(normalizedName, { ...options, autoCompile: true });
	const implDeploy = await deploy(normalizedName, [], { ...options, kind: "contracts" });
	const artifacts = await loadProxyArtifacts();
	const proxyAdmin = new EvmContract(String(current.admin), artifacts.ProxyAdmin.abi, runner);
	const tx = await proxyAdmin.upgradeAndCall(String(proxyAddress), implDeploy.address, "0x");
	await tx.wait();
	const nextHistory = [
		...(Array.isArray(current.history) ? current.history : []),
		createProxyHistoryEntry(normalizedName, implDeploy.address),
	];
	await saveProxyRecord({
		chainId,
		deploymentKey: String(current.deploymentKey),
		contractName: normalizedName,
		proxyAddress: String(proxyAddress),
		proxyAdminAddress: String(current.admin),
		implementationAddress: implDeploy.address,
		history: nextHistory,
	}, options);

	return toProxyResult({
		chainId,
		deploymentKey: String(current.deploymentKey),
		proxyAddress: String(proxyAddress),
		implementationAddress: implDeploy.address,
		abi: Array.isArray(artifact?.abi) ? artifact.abi : [],
		runner,
	});
}

export default deploy;
