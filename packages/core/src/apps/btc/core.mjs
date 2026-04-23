/**
 * BTC Core API - 只读查询能力
 * 提供跨 provider 的统一 BTC 查询接口
 */

import { createBtcNetProvider, resolveBtcProvider } from "./netprovider.mjs";

/**
 * 获取 provider 的摘要信息
 */
export async function btcProviderSummary(networkNameOrProvider) {
	const provider = resolveBtcProvider(networkNameOrProvider);

	return {
		networkName: provider.networkName,
		providerType: provider.providerType,
		name: provider.adapter.name,
		walletName: provider.walletName,
		rpcUrl: provider.rpcUrl,
		restUrl: provider.restUrl,
		explorerUrl: provider.explorerUrl,
		isLocal: provider.isLocal,
		isMainnet: provider.isMainnet,
		isPublicTestnet: provider.isPublicTestnet,
		supportsCapabilities: {
			healthcheck: provider.supports("healthcheck"),
			getBlock: provider.supports("getBlock"),
			getTx: provider.supports("getTx"),
			getUtxos: provider.supports("getUtxos"),
			estimateFee: provider.supports("estimateFee"),
			sendTx: provider.supports("sendTx"),
			signTx: provider.supports("signTx"),
			buildPsbt: provider.supports("buildPsbt"),
			walletOps: provider.supports("walletOps"),
		},
	};
}

/**
 * 健康检查：验证 provider 可连接
 */
export async function btcNodeHealth(networkNameOrProvider) {
	const provider = resolveBtcProvider(networkNameOrProvider);

	if (!provider.supports("healthcheck")) {
		return {
			networkName: provider.networkName,
			providerType: provider.providerType,
			healthy: false,
			error: `${provider.adapter.name} 不支持健康检查`,
		};
	}

	try {
		const health = await provider.healthcheck();
		return {
			networkName: provider.networkName,
			providerType: provider.providerType,
			...health,
		};
	} catch (error) {
		return {
			networkName: provider.networkName,
			providerType: provider.providerType,
			healthy: false,
			error: error.message,
		};
	}
}

/**
 * 获取单笔交易详情
 */
export async function btcTxGet(options = {}, networkNameOrProvider) {
	const provider = resolveBtcProvider(networkNameOrProvider);

	if (!provider.supports("getTx")) {
		throw new Error(`${provider.adapter.name} 不支持交易查询`);
	}

	const txid = String(options.txid || "").trim();
	if (!txid) {
		throw new Error("txid 不能为空");
	}

	try {
		const tx = await provider.adapter.getTx(txid);
		return {
			networkName: provider.networkName,
			providerType: provider.providerType,
			txid: tx.txid || txid,
			hash: tx.hash || null,
			size: tx.size || 0,
			vsize: tx.vsize || 0,
			weight: tx.weight || 0,
			blockHash: tx.blockhash || tx.block_hash || null,
			blockHeight: tx.blockheight || tx.block_height || 0,
			blockTime: tx.blocktime || tx.block_time || 0,
			confirmations: tx.confirmations || 0,
			vin: tx.vin || [],
			vout: tx.vout || [],
		};
	} catch (error) {
		throw new Error(`获取交易 ${txid} 失败: ${error.message}`);
	}
}

/**
 * 获取 UTXO 列表
 */
export async function btcUtxoList(options = {}, networkNameOrProvider) {
	const provider = resolveBtcProvider(networkNameOrProvider);

	if (!provider.supports("getUtxos")) {
		throw new Error(`${provider.adapter.name} 不支持 UTXO 查询`);
	}

	const addresses = Array.isArray(options.addresses)
		? options.addresses.map((a) => String(a).trim()).filter(Boolean)
		: [];

	if (addresses.length === 0) {
		throw new Error("addresses 不能为空");
	}

	try {
		const utxos = await provider.adapter.getUtxos(addresses);

		// 对单地址场景，确保 UTXO 正确关联到该地址
		if (addresses.length === 1) {
			const singleAddress = addresses[0];
			for (const utxo of utxos) {
				if (!utxo.address) {
					utxo.address = singleAddress;
				}
			}
		}

		return {
			networkName: provider.networkName,
			providerType: provider.providerType,
			searched: addresses.length,
			utxos,
			totalAmount: utxos.reduce((sum, u) => sum + (u.amount || 0), 0),
		};
	} catch (error) {
		// 保留原始错误的 code 和 details（用于智能回退）
		if (error.code === "API_LIMIT_FALLBACK") {
			throw error;
		}
		throw new Error(`UTXO 查询失败: ${error.message}`);
	}
}

/**
 * 获取地址余额
 */
export async function btcBalanceGet(options = {}, networkNameOrProvider) {
	const provider = resolveBtcProvider(networkNameOrProvider);

	if (!provider.supports("getUtxos")) {
		throw new Error(`${provider.adapter.name} 不支持余额查询`);
	}

	const addresses = Array.isArray(options.addresses)
		? options.addresses.map((a) => String(a).trim()).filter(Boolean)
		: [];

	if (addresses.length === 0) {
		throw new Error("addresses 不能为空");
	}

	try {
		const utxoResult = await btcUtxoList(options, provider);

		const balanceMap = new Map();

		for (const addr of addresses) {
			balanceMap.set(addr, {
				address: addr,
				confirmed: 0,
				unconfirmed: 0,
				utxoCount: 0,
			});
		}

		for (const utxo of utxoResult.utxos) {
			const addr = utxo.address || addresses[0];
			if (!addr) continue;

			const current = balanceMap.get(addr) || {
				address: addr,
				confirmed: 0,
				unconfirmed: 0,
				utxoCount: 0,
			};

			const confirmed = utxo.confirmations ? utxo.confirmations > 0 : utxo.confirmed;
			if (confirmed) {
				current.confirmed += utxo.amount || 0;
			} else {
				current.unconfirmed += utxo.amount || 0;
			}

			current.utxoCount += 1;
			balanceMap.set(addr, current);
		}

		const rows = Array.from(balanceMap.values()).map((row) => ({
			address: row.address,
			confirmed: row.confirmed,
			unconfirmed: row.unconfirmed,
			total: row.confirmed + row.unconfirmed,
			utxoCount: row.utxoCount,
		}));

		return {
			networkName: provider.networkName,
			providerType: provider.providerType,
			rows,
			totalConfirmed: rows.reduce((sum, r) => sum + r.confirmed, 0),
			totalUnconfirmed: rows.reduce((sum, r) => sum + r.unconfirmed, 0),
		};
	} catch (error) {
		// 智能回退：UTXO 限制时，用 getAddress 获取余额汇总（无需具体 UTXO 列表）
		if (error.code === "API_LIMIT_FALLBACK" && provider.adapter.getAddress) {
			try {
				const rows = [];
				for (const addr of addresses) {
					const addrInfo = await provider.adapter.getAddress(addr);
					const chainStats = addrInfo.chain_stats || {};
					const mempoolStats = addrInfo.mempool_stats || {};
					
					const confirmedSats = chainStats.funded_txo_sum || 0;
					const unconfirmedSats = mempoolStats.funded_txo_sum || 0;
					
					rows.push({
						address: addr,
						confirmed: confirmedSats / 1e8,
						unconfirmed: unconfirmedSats / 1e8,
						total: (confirmedSats + unconfirmedSats) / 1e8,
						utxoCount: chainStats.funded_txo_count + mempoolStats.funded_txo_count,
						note: "UTXO 限制，仅显示余额汇总无具体列表",
					});
				}
				
				return {
					networkName: provider.networkName,
					providerType: provider.providerType,
					rows,
					totalConfirmed: rows.reduce((sum, r) => sum + r.confirmed, 0),
					totalUnconfirmed: rows.reduce((sum, r) => sum + r.unconfirmed, 0),
				};
			} catch (fallbackError) {
				throw new Error(`余额查询失败（UTXO 限制回退也失败）: ${fallbackError.message}`);
			}
		}
		
		throw new Error(`余额查询失败: ${error.message}`);
	}
}

/**
 * 估计手续费
 */
export async function btcFeeEstimate(options = {}, networkNameOrProvider) {
	const provider = resolveBtcProvider(networkNameOrProvider);

	if (!provider.supports("estimateFee")) {
		throw new Error(`${provider.adapter.name} 不支持费用估计`);
	}

	const blocks = Math.max(1, Number(options.blocks) || 6);

	try {
		const fee = await provider.adapter.estimateFee(blocks);

		return {
			networkName: provider.networkName,
			providerType: provider.providerType,
			feeRate: fee.feeRate,
			blocks,
			unit: "BTC/B",
		};
	} catch (error) {
		throw new Error(`费用估计失败: ${error.message}`);
	}
}

export default {
	btcProviderSummary,
	btcNodeHealth,
	btcTxGet,
	btcUtxoList,
	btcBalanceGet,
	btcFeeEstimate,
};
