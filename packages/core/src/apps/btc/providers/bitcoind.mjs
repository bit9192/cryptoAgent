/**
 * Bitcoin Core 适配器
 * 使用 JSON-RPC 2.0 协议与 Bitcoin Core 节点通信
 */

import { getProviderDefaults, providerSupports } from "./defaults.mjs";

async function btcRpcCall(options = {}) {
	const {
		rpcUrl,
		method,
		params = [],
		id = "core-btc",
		username,
		password,
		timeoutMs = 15000,
	} = options;

	if (!rpcUrl) throw new Error("rpcUrl 不能为空");
	if (!method) throw new Error("method 不能为空");

	const body = {
		jsonrpc: "2.0",
		id,
		method,
		params: Array.isArray(params) ? params : [],
	};

	const headers = {
		"content-type": "application/json",
		accept: "application/json",
	};

	if (username && password) {
		const token = Buffer.from(`${username}:${password}`).toString("base64");
		headers.authorization = `Basic ${token}`;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(rpcUrl, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const payload = await response.json();

		if (payload.error) {
			const rpcError = new Error(`RPC error: ${payload.error.message ?? "unknown"}`);
			rpcError.code = payload.error.code;
			rpcError.rpcError = payload.error;
			throw rpcError;
		}

		return payload.result;
	} finally {
		clearTimeout(timeoutId);
	}
}

export class BitcoinCoreAdapter {
	constructor(config = {}) {
		this.providerType = "bitcoind";
		this.name = "Bitcoin Core";
		this.config = config;
		this.rpcUrl = String(config.rpcUrl || "http://127.0.0.1:8332");
		this.username = String(config.rpcUsername || "bitcoinuser");
		this.password = String(config.rpcPassword || "bitcoinpass");
		this.walletName = String(config.walletName || "default");
		this.timeoutMs = Number(config.timeoutMs || 15000);
		this._defaults = getProviderDefaults("bitcoind");
	}

	supports(capability) {
		return providerSupports("bitcoind", capability);
	}

	_unsupportedError(capability) {
		const error = new Error(
			`Bitcoin Core adapter 不支持 ${capability} 能力`,
		);
		error.code = "CAPABILITY_NOT_SUPPORTED";
		return error;
	}

	async rpcCall(method, params = []) {
		return btcRpcCall({
			rpcUrl: this.rpcUrl,
			method,
			params,
			username: this.username,
			password: this.password,
			timeoutMs: this.timeoutMs,
		});
	}

	async walletRpcCall(method, params = []) {
		const walletPath = `/wallet/${encodeURIComponent(this.walletName)}`;
		const walletUrl = new URL(this.rpcUrl);
		walletUrl.pathname = walletPath;

		return btcRpcCall({
			rpcUrl: walletUrl.toString(),
			method,
			params,
			username: this.username,
			password: this.password,
			timeoutMs: this.timeoutMs,
		});
	}

	async healthcheck() {
		try {
			const info = await this.rpcCall("getblockchaininfo", []);
			return {
				healthy: true,
				chain: info?.chain,
				blocks: info?.blocks,
				headers: info?.headers,
			};
		} catch (error) {
			return {
				healthy: false,
				error: error.message,
			};
		}
	}

	async getBlock(blockHashOrNumber) {
		if (!this.supports("getBlock")) {
			throw this._unsupportedError("getBlock");
		}

		const raw = String(blockHashOrNumber);
		if (/^\d+$/.test(raw)) {
			const hash = await this.rpcCall("getblockhash", [Number(raw)]);
			return this.rpcCall("getblock", [hash, 2]);
		}

		return this.rpcCall("getblock", [raw, 2]);
	}

	async getTx(txid) {
		if (!this.supports("getTx")) {
			throw this._unsupportedError("getTx");
		}

		return this.rpcCall("getrawtransaction", [String(txid), true]);
	}

	async getUtxos(addresses = []) {
		if (!this.supports("getUtxos")) {
			throw this._unsupportedError("getUtxos");
		}

		if (addresses.length === 0) {
			throw new Error("addresses 不能为空");
		}

		const descriptors = addresses.map((addr) => `addr(${addr})`);
		const result = await this.rpcCall("scantxoutset", ["start", descriptors]);

		return (result?.unspents || []).map((item) => ({
			txid: item.txid,
			vout: item.vout,
			amount: item.amount,
			height: item.height,
			descriptor: item.desc,
		}));
	}

	async estimateFee(blocks = 6) {
		if (!this.supports("estimateFee")) {
			throw this._unsupportedError("estimateFee");
		}

		const result = await this.rpcCall("estimatesmartfee", [Math.max(1, blocks)]);
		return {
			feeRate: result?.feerate,
			blocks: result?.blocks,
		};
	}

	async sendTx(rawTx) {
		if (!this.supports("sendTx")) {
			throw this._unsupportedError("sendTx");
		}

		const txid = await this.rpcCall("sendrawtransaction", [String(rawTx)]);
		return txid;
	}
}

export default BitcoinCoreAdapter;
