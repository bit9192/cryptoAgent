import { resolveBtcProvider } from "../netprovider.mjs";

async function listBtcUtxosForBalance(options = {}, networkNameOrProvider) {
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

	const utxos = await provider.adapter.getUtxos(addresses);

	if (addresses.length === 1) {
		const singleAddress = addresses[0];
		for (const utxo of utxos) {
			if (!utxo.address) {
				utxo.address = singleAddress;
			}
		}
	}

	return {
		provider,
		addresses,
		utxos,
	};
}

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
		const utxoResult = await listBtcUtxosForBalance(options, provider);

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
		if (error.code === "API_LIMIT_FALLBACK" && provider.adapter.getAddress) {
			try {
				const rows = [];
				for (const addr of addresses) {
					const addrInfo = await provider.adapter.getAddress(addr);
					const chainStats = addrInfo.chain_stats || {};
					const mempoolStats = addrInfo.mempool_stats || {};

					const confirmedSats = (chainStats.funded_txo_sum || 0) - (chainStats.spent_txo_sum || 0);
					const unconfirmedSats = (mempoolStats.funded_txo_sum || 0) - (mempoolStats.spent_txo_sum || 0);

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

export default {
	btcBalanceGet,
};
