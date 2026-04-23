/**
 * Mempool.space REST API 适配器
 * 用于轻量级区块、交易、地址查询
 */

import { getProviderDefaults, providerSupports } from "./defaults.mjs";

export class MempoolAdapter {
	constructor(config = {}) {
		this.providerType = "mempool";
		this.name = "Mempool API";
		this.config = config;
		this.baseUrl = (config.restUrl || "https://mempool.space").replace(/\/$/, "");
		this.apiKey = config.apiKey || "";
		this.timeoutMs = config.timeoutMs || 15000;
		this._defaults = getProviderDefaults("mempool");
	}

	async _fetchJson(path, options = {}) {
		const url = `${this.baseUrl}${path}`;
		const timeoutMs = options.timeoutMs || this.timeoutMs;
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

	async _fetchText(path, options = {}) {
		const url = `${this.baseUrl}${path}`;
		const timeoutMs = options.timeoutMs || this.timeoutMs;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				method: options.method || "GET",
				headers: {
					...(options.headers || {}),
				},
				body: options.body,
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response.text();
		} finally {
			clearTimeout(timeoutId);
		}
	}

	supports(capability) {
		return providerSupports("mempool", capability);
	}

	_unsupportedError(capability) {
		const error = new Error(
			`Mempool adapter 不支持 ${capability} 能力。请使用 Bitcoin Core 或其他支持此操作的 provider。`,
		);
		error.code = "CAPABILITY_NOT_SUPPORTED";
		return error;
	}

	async healthcheck() {
		try {
			const status = await this._fetchJson(`/api/v1/fees/recommended`, {
				timeoutMs: this.timeoutMs,
			});
			return {
				healthy: true,
				info: status,
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

		const isNumber = /^\d+$/.test(String(blockHashOrNumber));
		const target = isNumber ? `/height/${blockHashOrNumber}` : `/${blockHashOrNumber}`;

		return this._fetchJson(`/api/block${target}`, {
			timeoutMs: this.timeoutMs,
		});
	}

	async getTx(txid) {
		if (!this.supports("getTx")) {
			throw this._unsupportedError("getTx");
		}

		return this._fetchJson(`/api/tx/${txid}`, {
			timeoutMs: this.timeoutMs,
		});
	}

	async getAddress(address) {
		/**
		 * 获取地址汇总信息（无 UTXO 限制）
		 * 返回格式: { address, chain_stats: { funded_txo_count, funded_txo_sum, ... }, mempool_stats: {...} }
		 */
		const addr = String(address).trim();
		return this._fetchJson(`/api/address/${addr}`, { timeoutMs: this.timeoutMs });
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
			try {
				const result = await this._fetchJson(
					`/api/address/${address}/utxo`,
					{ timeoutMs: this.timeoutMs },
				);

				if (Array.isArray(result)) {
					utxos.push(
						...result.map((item) => ({
							txid: item.txid,
							vout: item.vout,
							address,
							amount: item.value / 1e8, // convert sats to BTC
							height: item.status?.block_height,
							confirmed: item.status?.confirmed,
						})),
					);
				}
			} catch (error) {
				// Mempool.space API 限制处理：自动回退到 getAddress 获取余额汇总
				if (error.message.includes("HTTP 400") || error.message.includes("many unspent")) {
					const msg = `Mempool.space UTXO 限制：>500个 UTXO，已回退到余额汇总模式（无具体 UTXO 列表）`;
					const err = new Error(msg);
					err.code = "API_LIMIT_FALLBACK";
					err.details = { address, fallbackToBalance: true };
					throw err;
				}
				throw error;
			}
		}

		return utxos;
	}

	async estimateFee(blocks = 6) {
		if (!this.supports("estimateFee")) {
			throw this._unsupportedError("estimateFee");
		}

		const fees = await this._fetchJson(`/api/v1/fees/recommended`, {
			timeoutMs: this.timeoutMs,
		});

		// Mempool 返回 fastestFee, halfHourFee, hourFee（sat/B）
		// 按 blocks 选择合适的速度
		let feeRate = fees.hourFee;
		if (blocks <= 2) {
			feeRate = fees.fastestFee;
		} else if (blocks <= 6) {
			feeRate = fees.halfHourFee;
		}

		return { feeRate: feeRate / 1e8, blocks };
	}

	async sendTx(rawTx) {
		if (!this.supports("sendTx")) {
			throw this._unsupportedError("sendTx");
		}

		const txid = await this._fetchText(`/api/tx`, {
			method: "POST",
			body: rawTx,
			headers: {
				"content-type": "text/plain",
			},
			timeoutMs: this.timeoutMs,
		});

		return String(txid || "").trim();
	}
}

export default MempoolAdapter;
