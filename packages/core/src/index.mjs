// 新架构入口
// 可直接复用 legacy 里的任何模块，例如：
//
// import { getTokenRiskReport } from "@ch/legacy/deploy/offchain/token-risk/index.js"
// import { simulateTokenSellability } from "@ch/legacy/deploy/evm/risk/fork-sim.js"
// import { offchain, evm, config } from "@ch/legacy/deploy/index.js"

export { createWallet } from "./apps/wallet/index.mjs";
export { createDefaultWallet } from "./apps/default-wallet.mjs";
export { createEvmProvider } from "./apps/evm/provider.mjs";
export {
	createEvmNetProvider,
	defaultEvmNetProvider,
	resolveEvmNetProvider,
} from "./apps/evm/netprovider.mjs";
export { createBtcProvider } from "./apps/btc/provider.mjs";
export {
	brc20SummaryGet,
	brc20TokenInfoGet,
	brc20TransferableListGet,
	brc20BalanceGet,
	createBrc20,
} from "./apps/btc/index.mjs";
export { createTrxProvider } from "./apps/trx/provider.mjs";
export {
	evmNetworks,
	defaultEvmNetworkName,
	normalizeEvmNetworkName,
	getEvmNetworkConfig,
	listEvmNetworks,
} from "./apps/evm/configs/networks.js";
export {
	EVM_DEFAULT_ADDRESS_BOOK,
	getEvmAddressBook,
	resolveEvmAddress,
} from "./apps/evm/configs/defaults.js";
export {
	EVM_DEFAULT_CONTRACT_BOOK,
	getEvmContractBook,
	resolveEvmContract,
} from "./apps/evm/configs/contracts.js";
export {
	EVM_DEFAULT_TOKENS,
	getEvmTokenBook,
	resolveEvmToken,
} from "./apps/evm/configs/tokens.js";
export {
	resolveEvmDeploymentDirs,
	loadEvmDeployment,
	getEvmDeployedAddress,
} from "./apps/evm/configs/deployments.js";
export { compileContracts } from "./apps/evm/contracts/compile.mjs";
export {
	loadContractManifest,
	loadContractArtifact,
} from "./apps/evm/contracts/load.mjs";
export {
	btcNetworks,
	defaultBtcNetworkName,
	normalizeBtcNetworkName,
	getBtcNetworkConfig,
} from "./apps/btc/config/networks.js";
export {
	BTC_DEFAULT_TOKENS,
	getBtcTokenBook,
	resolveBtcToken,
} from "./apps/btc/config/tokens.js";
export {
	trxNetworks,
	defaultTrxNetworkName,
	normalizeTrxNetworkName,
	getTrxNetworkConfig,
} from "./apps/trx/config/networks.js";
export {
	TRX_DEFAULT_TOKENS,
	getTrxTokenBook,
	resolveTrxToken,
} from "./apps/trx/config/tokens.js";
export {
	aggregateAssetSnapshot,
} from "./modules/assets-engine/index.mjs";
