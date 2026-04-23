/**
 * BlockBook REST API 适配器
 * 用于轻量级区块、交易、地址、UTXO 查询
 */

import { getProviderDefaults, providerSupports } from "./defaults.mjs";

async function blockbookFetch(url, options = {}) {
	const timeoutMs = options.timeoutMs || 15000;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			method: options.method || "GET",
			headers: {
				accept: "application/json",
				...(options.headers || {}),
			},
			body: options.body,
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return response.json();
	} finally {
		clearTimeout(timeoutId);
	}
}

export class BlockbookAdapter {
	constructor(config = {}) {
		this.providerType = "blockbook";
		this.name = "BlockBook";
		this.config = config;
		this.baseUrl = (config.restUrl || "http://127.0.0.1:9114").replace(/\/$/, "");
		this.timeoutMs = config.timeoutMs || 15000;
		this._defaults = getProviderDefaults("blockbook");
	}

	supports(capability) {
		return providerSupports("blockbook", capability);
	}

	_unsupportedError(capability) {
		const error = new Error(
			`BlockBook adapter 不支持 ${capability} 能力。请使用 Bitcoin Core 或其他支持此操作的 provider。`,
		);
		error.code = "CAPABILITY_NOT_SUPPORTED";
		return error;
	}

	async healthcheck() {
		try {
			const status = await blockbookFetch(`${this.baseUrl}/api/v2/status`, {
				timeoutMs: this.timeoutMs,
			});
			return {
				healthy: true,
				chain: status?.chain,
				bestBlockHeight: status?.bestBlockHeight,
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

		const target = String(blockHashOrNumber);
		return blockbookFetch(`${this.baseUrl}/api/v2/block/${target}`, {
			timeoutMs: this.timeoutMs,
		});
	}

	async getTx(txid) {
		if (!this.supports("getTx")) {
			throw this._unsupportedError("getTx");
		}

		return blockbookFetch(`${this.baseUrl}/api/v2/tx/${txid}`, {
			timeoutMs: this.timeoutMs,
		});
	}

	async getUtxos(addresses = []) {
		if (!this.supports("getUtxos")) {
			throw this._unsupportedError("getUtxos");
		}

		if (addresses.length === 0) {
			throw new Error("addresses 不能为空");
		}

		const utxos = [];

		for (const address of addresses) {
			const result = await blockbookFetch(
				`${this.baseUrl}/api/v2/utxo/${address}`,
				{ timeoutMs: this.timeoutMs },
			);

			if (Array.isArray(result)) {
				utxos.push(
					...result.map((item) => ({
						txid: item.txid,
						vout: item.vout,
						address,
						amount: item.value / 1e8,
						height: item.height,
						confirmations: item.confirmations,
					})),
				);
			}
		}

		return utxos;
	}

	async estimateFee(blocks = 6) {
		if (!this.supports("estimateFee")) {
			throw this._unsupportedError("estimateFee");
		}

		const result = await blockbookFetch(
			`${this.baseUrl}/api/v2/estimatefee/${Math.max(1, blocks)}`,
			{ timeoutMs: this.timeoutMs },
		);

		return {
			feeRate: result?.result,
			blocks,
		};
	}

	async sendTx(rawTx) {
		if (!this.supports("sendTx")) {
			throw this._unsupportedError("sendTx");
		}

		const result = await blockbookFetch(`${this.baseUrl}/api/v2/sendtx`, {
			method: "POST",
			body: rawTx,
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
			timeoutMs: this.timeoutMs,
		});

		return result?.result;
	}
}

export default BlockbookAdapter;
