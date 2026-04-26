import "../../load-env.mjs";

import { resolveBtcProvider } from "./netprovider.mjs";
import { resolveBtcToken } from "./config/tokens.js";
import { brc20BalanceBatchGet as queryBrc20BalanceBatch } from "./assets/brc20-balance-batch.mjs";

const UNISAT_BASE = "https://open-api.unisat.io";
const BRC20_MAINNET_ALIASES = new Set(["mainnet", "bitcoin", "main"]);

function detectBtcNetworkFromAddress(address) {
	const addr = String(address ?? "").trim();
	if (/^bc1/i.test(addr)) return "mainnet";
	if (/^[13]/.test(addr)) return "mainnet";
	if (/^tb1/i.test(addr)) return "testnet";
	if (/^[mn2]/.test(addr)) return "testnet";
	if (/^bcrt1/i.test(addr)) return "regtest";
	return null;
}

function normalizeTicker(ticker) {
	const value = String(ticker ?? "").trim().toUpperCase();
	if (!value) throw new Error("BRC20 ticker 不能为空");
	return value;
}

function resolveBrc20TokenMeta(input = {}, networkName = "mainnet") {
	const explicit = String(input.ticker ?? input.tokenAddress ?? "").trim();
	if (explicit) {
		const ticker = normalizeTicker(explicit);
		try {
			const meta = resolveBtcToken({ network: networkName, key: ticker.toLowerCase() });
			return {
				ticker,
				name: meta.name,
				symbol: meta.symbol,
				decimals: Number.isFinite(Number(meta.decimals)) ? Number(meta.decimals) : null,
			};
		} catch {
			return {
				ticker,
				name: ticker,
				symbol: ticker,
				decimals: null,
			};
		}
	}

	const key = String(input.token ?? input.key ?? input.symbol ?? "").trim();
	if (!key) {
		throw new Error("BRC20 ticker 不能为空");
	}

	const meta = resolveBtcToken({ network: networkName, key });
	return {
		ticker: normalizeTicker(meta.address || meta.symbol || key),
		name: meta.name,
		symbol: meta.symbol,
		decimals: Number.isFinite(Number(meta.decimals)) ? Number(meta.decimals) : null,
	};
}

function normalizeAddress(address, label = "address") {
	const value = String(address ?? "").trim();
	if (!value) throw new Error(`${label} 不能为空`);
	return value;
}

function normalizeApiBase(apiBase) {
	return String(apiBase ?? process.env.BRC20_API_URL ?? UNISAT_BASE).trim().replace(/\/+$/, "");
}

function normalizeApiKey(apiKey) {
	return String(apiKey ?? process.env.BRC20_API_KEY ?? "").trim();
}

function buildHeaders(apiKey, extraHeaders = {}) {
	const headers = {
		accept: "application/json",
		...extraHeaders,
	};
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}
	return headers;
}

function appendQuery(url, query = {}) {
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue;
		url.searchParams.set(key, String(value));
	}
	return url;
}

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isRetriableStatus(status) {
	return status === 403 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function unisatRequest(endpoint, options = {}) {
	const method = String(options.method ?? "GET").toUpperCase();
	const apiBase = normalizeApiBase(options.apiBase);
	const apiKey = normalizeApiKey(options.apiKey);
	const url = appendQuery(new URL(endpoint, `${apiBase}/`), options.query ?? {});
	const useNoKeyFallback = options.useNoKeyFallback !== false;
	const attempts = [];
	if (apiKey) attempts.push({ apiKey, tag: "with-key" });
	if (!apiKey || useNoKeyFallback) attempts.push({ apiKey: "", tag: "no-key" });

	let lastError = null;
	for (let i = 0; i < attempts.length; i += 1) {
		const attempt = attempts[i];
		const headers = buildHeaders(attempt.apiKey, options.headers ?? {});
		const init = { method, headers };

		if (options.body !== undefined) {
			headers["content-type"] = "application/json";
			init.body = JSON.stringify(options.body);
		}

		let retryCount = 0;
		while (retryCount <= 2) {
			let response;
			try {
				response = await fetch(url, init);
			} catch (error) {
				lastError = new Error(`UniSat network error (${attempt.tag}): ${error?.message ?? error}`);
				if (retryCount >= 2) break;
				retryCount += 1;
				await delay(250 * retryCount);
				continue;
			}

			if (!response.ok) {
				lastError = new Error(`UniSat API error: HTTP ${response.status} (${attempt.tag})`);
				if (!isRetriableStatus(response.status) || retryCount >= 2) break;
				retryCount += 1;
				await delay(250 * retryCount);
				continue;
			}

			const json = await response.json();
			if (Number(json?.code ?? -1) !== 0) {
				lastError = new Error(`UniSat error: ${json?.msg || "unknown error"} (${attempt.tag})`);
				if (retryCount >= 2) break;
				retryCount += 1;
				await delay(250 * retryCount);
				continue;
			}

			return json.data ?? null;
		}
	}

	throw lastError ?? new Error("UniSat request failed");
}

function resolveMainnetContext(address, networkNameOrProvider) {
	let networkName = null;
	let provider = null;

	if (networkNameOrProvider !== undefined && networkNameOrProvider !== null) {
		provider = resolveBtcProvider(networkNameOrProvider);
		networkName = String(provider?.networkName ?? "").trim().toLowerCase();
	} else if (address) {
		networkName = detectBtcNetworkFromAddress(address);
	}

	if (!BRC20_MAINNET_ALIASES.has(String(networkName ?? "").trim().toLowerCase())) {
		throw new Error(`BRC20 当前仅支持 mainnet，当前网络: ${networkName ?? "unknown"}`);
	}

	return {
		networkName: "mainnet",
		provider,
	};
}

function normalizeSummaryRow(row = {}) {
	return {
		ticker: String(row.ticker ?? "").trim().toUpperCase(),
		overallBalance: String(row.overallBalance ?? "0"),
		transferableBalance: String(row.transferableBalance ?? "0"),
		availableBalance: String(row.availableBalance ?? "0"),
		decimal: Number.isFinite(Number(row.decimal)) ? Number(row.decimal) : null,
		selfMint: typeof row.selfMint === "boolean" ? row.selfMint : null,
		raw: row,
	};
}

function normalizeHistoryInscription(row = {}) {
	return {
		inscriptionId: String(row.inscriptionId ?? "").trim(),
		inscriptionNumber: Number(row.inscriptionNumber ?? 0),
		confirmations: Number(row.confirmations ?? 0),
		satoshi: Number(row.satoshi ?? 0),
		data: {
			op: String(row.data?.op ?? "").trim(),
			tick: String(row.data?.tick ?? "").trim().toUpperCase(),
			amt: String(row.data?.amt ?? "0"),
			decimal: String(row.data?.decimal ?? ""),
			lim: String(row.data?.lim ?? ""),
			max: String(row.data?.max ?? ""),
			minted: String(row.data?.minted ?? ""),
			to: String(row.data?.to ?? "").trim(),
		},
		raw: row,
	};
}

function normalizeTransferableRows(detail) {
	if (Array.isArray(detail)) {
		return detail.map(normalizeHistoryInscription);
	}
	if (detail && typeof detail === "object" && detail.inscriptionId) {
		return [normalizeHistoryInscription(detail)];
	}
	return [];
}

function publicKeyToHex(publicKey) {
	if (Buffer.isBuffer(publicKey)) return publicKey.toString("hex");
	if (publicKey instanceof Uint8Array) return Buffer.from(publicKey).toString("hex");
	const value = String(publicKey ?? "").trim().replace(/^0x/i, "");
	if (!value) throw new Error("payer publicKey 不能为空");
	return value;
}

function normalizePsbtHex(value) {
	const hex = String(value ?? "").trim().replace(/^0x/i, "");
	if (!hex) throw new Error("psbtHex 不能为空");
	return hex;
}

function toPsbtBase64(psbtHex) {
	return Buffer.from(normalizePsbtHex(psbtHex), "hex").toString("base64");
}

function normalizeSigningIndexes(inputsToSign, payerAddress, derivePath, addressType) {
	const normalizedAddress = String(payerAddress ?? "").trim();
	if (!normalizedAddress) throw new Error("payerAddress 不能为空");
	if (!derivePath) throw new Error("BRC20 transfer 需要 derivePath 以签名 UniSat PSBT");

	const requests = [];
	for (const item of Array.isArray(inputsToSign) ? inputsToSign : []) {
		if (String(item?.address ?? "").trim() !== normalizedAddress) continue;
		for (const index of Array.isArray(item?.signingIndexes) ? item.signingIndexes : []) {
			requests.push({
				inputIndex: Number(index),
				derivePath,
				addressType,
			});
		}
	}
	return requests;
}

async function signUnisatPsbt(psbtHex, inputsToSign, signer, payer, signTarget) {
	const signingRequests = normalizeSigningIndexes(
		inputsToSign,
		payer.address,
		payer.derivePath,
		payer.addressType,
	);

	if (signingRequests.length === 0) {
		return normalizePsbtHex(psbtHex);
	}

	if (!signer || typeof signer.signPsbt !== "function") {
		throw new Error("BRC20 transfer 需要 signer.signPsbt");
	}

	const signed = await signer.signPsbt({
		psbtBase64: toPsbtBase64(psbtHex),
		signingRequests,
		finalize: false,
		target: signTarget,
	});

	const nextPsbtHex = String(signed?.result?.psbtHex ?? "").trim();
	if (!nextPsbtHex) {
		throw new Error("signPsbt 未返回已签名 psbtHex");
	}

	return nextPsbtHex;
}

async function resolvePayerContext(signer, baseOptions = {}, transferOptions = {}) {
	const addressType = String(
		transferOptions.addressType
			?? baseOptions.addressType
			?? "p2wpkh",
	).trim();
	const derivePath = String(
		transferOptions.derivePath
			?? transferOptions.path
			?? baseOptions.derivePath
			?? baseOptions.path
			?? "",
	).trim();
	const signerAddressOptions = {};
	if (addressType) signerAddressOptions.addressType = addressType;
	if (derivePath) signerAddressOptions.path = derivePath;

	const address = transferOptions.payerAddress
		? normalizeAddress(transferOptions.payerAddress, "payerAddress")
		: normalizeAddress(await signer.getAddress(signerAddressOptions), "payerAddress");

	const publicKey = transferOptions.payerPublicKey
		? publicKeyToHex(transferOptions.payerPublicKey)
		: publicKeyToHex((await signer.getPublicKey(signerAddressOptions))?.publicKey);

	return {
		address,
		publicKey,
		addressType,
		derivePath,
	};
}

export async function brc20SummaryGet(options = {}, networkNameOrProvider = null) {
	const address = normalizeAddress(options.address);
	const start = Number(options.start ?? 0);
	const limit = Number(options.limit ?? 16);
	const excludeZero = options.excludeZero ?? true;
	const tickFilter = options.tickFilter ?? 24;
	const { networkName } = resolveMainnetContext(address, networkNameOrProvider);
	const data = await unisatRequest(`v1/indexer/address/${encodeURIComponent(address)}/brc20/summary`, {
		query: {
			start,
			limit,
			tick_filter: tickFilter,
			exclude_zero: excludeZero,
		},
		apiBase: options.apiBase,
		apiKey: options.apiKey,
	});

	const rows = Array.isArray(data?.detail) ? data.detail.map(normalizeSummaryRow) : [];
	return {
		networkName,
		address,
		start: Number(data?.start ?? start),
		limit,
		total: Number(data?.total ?? rows.length),
		height: Number(data?.height ?? 0),
		rows,
	};
}

export async function brc20TokenInfoGet(options = {}, networkNameOrProvider = null) {
	const address = normalizeAddress(options.address);
	const { networkName } = resolveMainnetContext(address, networkNameOrProvider);
	const tokenMeta = resolveBrc20TokenMeta(options, networkName);
	const ticker = tokenMeta.ticker;
	const data = await unisatRequest(`v1/indexer/address/${encodeURIComponent(address)}/brc20/${encodeURIComponent(ticker)}/info`, {
		apiBase: options.apiBase,
		apiKey: options.apiKey,
	});

	return {
		networkName,
		address,
		ticker,
		tokenName: tokenMeta.name,
		overallBalance: String(data?.overallBalance ?? "0"),
		availableBalance: String(data?.availableBalance ?? "0"),
		availableBalanceSafe: String(data?.availableBalanceSafe ?? "0"),
		availableBalanceUnSafe: String(data?.availableBalanceUnSafe ?? "0"),
		transferableBalance: String(data?.transferableBalance ?? "0"),
		historyCount: Number(data?.historyCount ?? 0),
		transferableCount: Number(data?.transferableCount ?? 0),
		historyInscriptions: (Array.isArray(data?.historyInscriptions) ? data.historyInscriptions : []).map(normalizeHistoryInscription),
		transferableInscriptions: (Array.isArray(data?.transferableInscriptions) ? data.transferableInscriptions : []).map(normalizeHistoryInscription),
		raw: data,
	};
}

export async function brc20TransferableListGet(options = {}, networkNameOrProvider = null) {
	const address = normalizeAddress(options.address);
	const start = Number(options.start ?? 0);
	const limit = Number(options.limit ?? 16);
	const { networkName } = resolveMainnetContext(address, networkNameOrProvider);
	const tokenMeta = resolveBrc20TokenMeta(options, networkName);
	const ticker = tokenMeta.ticker;
	const data = await unisatRequest(
		`v1/indexer/address/${encodeURIComponent(address)}/brc20/${encodeURIComponent(ticker)}/transferable-inscriptions`,
		{
			query: { start, limit },
			apiBase: options.apiBase,
			apiKey: options.apiKey,
		},
	);

	const rows = normalizeTransferableRows(data?.detail);
	return {
		networkName,
		address,
		ticker,
		start,
		limit,
		rows,
		raw: data,
	};
}

export async function brc20BalanceGet(options = {}, networkNameOrProvider = null) {
	const info = await brc20TokenInfoGet(options, networkNameOrProvider);
	const tokenMeta = resolveBrc20TokenMeta({
		ticker: info.ticker,
		...options,
	}, info.networkName);
	return {
		networkName: info.networkName,
		address: info.address,
		balance: info.overallBalance,
		availableBalance: info.availableBalance,
		transferableBalance: info.transferableBalance,
		decimals: tokenMeta.decimals,
		symbol: tokenMeta.symbol,
		tokenAddress: info.ticker,
		tokenName: tokenMeta.name,
		type: "brc20",
		transferableCount: info.transferableCount,
	};
}

export async function brc20BalanceBatchGet(input = [], networkNameOrProvider = null) {
	return queryBrc20BalanceBatch(input, networkNameOrProvider);
}

export function createBrc20(options = {}) {
	const signer = options.signer;
	if (!signer) throw new Error("BRC20 需要 signer");
	const networkNameOrProvider = options.networkNameOrProvider ?? options.netProvider ?? null;
	const networkName = String((networkNameOrProvider && resolveBtcProvider(networkNameOrProvider)?.networkName) || "mainnet").toLowerCase();
	const tokenMeta = resolveBrc20TokenMeta(options, networkName);

	const ticker = tokenMeta.ticker;
	const tokenName = String(options.tokenName ?? tokenMeta.name ?? ticker).trim() || ticker;
	const baseOptions = {
		apiBase: options.apiBase,
		apiKey: options.apiKey,
		addressType: options.addressType,
		derivePath: options.derivePath ?? options.path,
	};

	const api = {
		tokenName,
		ticker,
		tokenAddress: ticker,
		runner: signer,
		connect(nextSigner) {
			return createBrc20({
				...options,
				signer: nextSigner,
			});
		},
		async symbol() {
			return ticker;
		},
		async balanceOf(address, queryOptions = {}) {
			return brc20BalanceGet({
				...queryOptions,
				address,
				ticker,
			}, networkNameOrProvider);
		},
		async info(address, queryOptions = {}) {
			return brc20TokenInfoGet({
				...queryOptions,
				address,
				ticker,
			}, networkNameOrProvider);
		},
		async transferableInscriptions(address, queryOptions = {}) {
			return brc20TransferableListGet({
				...queryOptions,
				address,
				ticker,
			}, networkNameOrProvider);
		},
		async transfer(to, amount, transferOptions = {}) {
			const receiveAddress = normalizeAddress(to, "to");
			const payer = await resolvePayerContext(signer, baseOptions, transferOptions);
			resolveMainnetContext(payer.address, networkNameOrProvider);

			const order = await unisatRequest("v2/inscribe/order/create/brc20-transfer", {
				method: "POST",
				apiBase: transferOptions.apiBase ?? baseOptions.apiBase,
				apiKey: transferOptions.apiKey ?? baseOptions.apiKey,
				body: {
					receiveAddress,
					feeRate: Number(transferOptions.feeRate ?? 1),
					outputValue: Number(transferOptions.outputValue ?? 546),
					devAddress: transferOptions.devAddress,
					devFee: transferOptions.devFee,
					brc20Ticker: ticker,
					brc20Amount: String(amount),
				},
			});

			const signTarget = {
				type: "brc20-transfer",
				ticker,
				to: receiveAddress,
				amount: String(amount),
				orderId: String(order?.orderId ?? "").trim(),
			};

			const commitRequest = await unisatRequest("v2/inscribe/order/request-commit", {
				method: "POST",
				apiBase: transferOptions.apiBase ?? baseOptions.apiBase,
				apiKey: transferOptions.apiKey ?? baseOptions.apiKey,
				body: {
					orderId: signTarget.orderId,
					payerAddress: payer.address,
					payerPubkey: payer.publicKey,
				},
			});

			const signedCommitPsbt = await signUnisatPsbt(
				commitRequest?.psbtHex,
				commitRequest?.inputsToSign,
				signer,
				payer,
				signTarget,
			);

			const commitSigned = await unisatRequest("v2/inscribe/order/sign-commit", {
				method: "POST",
				apiBase: transferOptions.apiBase ?? baseOptions.apiBase,
				apiKey: transferOptions.apiKey ?? baseOptions.apiKey,
				body: {
					orderId: signTarget.orderId,
					psbt: signedCommitPsbt,
				},
			});

			const signedRevealPsbt = await signUnisatPsbt(
				commitSigned?.psbtHex,
				commitSigned?.inputsToSign,
				signer,
				payer,
				signTarget,
			);

			const revealSigned = await unisatRequest("v2/inscribe/order/sign-reveal", {
				method: "POST",
				apiBase: transferOptions.apiBase ?? baseOptions.apiBase,
				apiKey: transferOptions.apiKey ?? baseOptions.apiKey,
				body: {
					orderId: signTarget.orderId,
					psbt: signedRevealPsbt,
				},
			});

			return {
				ok: true,
				orderId: signTarget.orderId,
				inscriptionId: String(revealSigned?.inscriptionId ?? "").trim() || null,
				ticker,
				amount: String(amount),
				from: payer.address,
				to: receiveAddress,
				order,
				commitRequest,
				commitSigned,
				revealSigned,
			};
		},
	};

	return api;
}

export default {
	brc20SummaryGet,
	brc20TokenInfoGet,
	brc20TransferableListGet,
	brc20BalanceGet,
	brc20BalanceBatchGet,
	createBrc20,
};
