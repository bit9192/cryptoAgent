
import path from "node:path";

async function unlockWallet(walletApp, filePath, password) {
	const loadResult = await walletApp.loadKeyFile({
		file: filePath,
		password,
	});

	if (!loadResult.ok) {
		return {
			ok: false,
			hd: null,
			key: null,
			hdList: [],
			keyList: [],
			totalUnlocked: 0,
			unlocked: {},
			warnings: loadResult.warnings ?? [],
		};
	}

	const unlockedKeys = new Map();
	const warnings = [];

	// 解锁新增的密钥
	for (const keyId of (loadResult.addedKeyIds ?? [])) {
		try {
			const unlockResult = await walletApp.unlock({
				keyId,
				password,
				ttlMs: 0,
			});
			if (unlockResult.ok) {
				unlockedKeys.set(keyId, unlockResult);
			} else {
				warnings.push(`解锁 key ${keyId} 失败`);
			}
		} catch (error) {
			warnings.push(`解锁 key ${keyId} 异常: ${error?.message ?? error}`);
		}
	}

	// 已存在的密钥也尝试建立 session
	for (const keyId of (loadResult.skippedKeyIds ?? [])) {
		if (unlockedKeys.has(keyId)) continue;
		try {
			const unlockResult = await walletApp.unlock({
				keyId,
				password,
				ttlMs: 0,
			});
			if (unlockResult.ok) {
				unlockedKeys.set(keyId, unlockResult);
			}
		} catch {
			// 已存在 key 解锁失败不中断
		}
	}

	const { entries, slots } = await buildEntries(walletApp, unlockedKeys, warnings);

	return {
		ok: unlockedKeys.size > 0,
		hd: slots.hd,
		key: slots.key,
		hdList: slots.hdList,
		keyList: slots.keyList,
		totalUnlocked: unlockedKeys.size,
		unlocked: Object.fromEntries(entries.map((e) => [e.keyId, e])),
		warnings,
	};
}

async function unlockDev(walletApp) {
	const devLoaded = await walletApp.loadDevKeys();
	const devKeyIds = [
		...(devLoaded?.addedKeyIds ?? []),
		...(devLoaded?.skippedKeyIds ?? []),
	];

	const unlockedKeys = new Map();
	const warnings = [];

	for (const keyId of devKeyIds) {
		try {
			const unlockResult = await walletApp.unlock({
				keyId,
				ttlMs: 0,
			});
			if (unlockResult?.ok) {
				unlockedKeys.set(keyId, unlockResult);
			}
		} catch (error) {
			warnings.push(`解锁 dev key ${keyId} 失败: ${error?.message ?? error}`);
		}
	}

	const { entries, slots } = await buildEntries(walletApp, unlockedKeys, warnings);

	return {
		ok: unlockedKeys.size > 0,
		devHd: slots.devHd,
		devKey: slots.devKey,
		devHdList: slots.devHdList,
		devKeyList: slots.devKeyList,
		totalUnlocked: unlockedKeys.size,
		unlocked: Object.fromEntries(entries.map((e) => [e.keyId, e])),
		warnings,
	};
}

async function buildEntries(walletApp, unlockedKeys, warnings) {
	const collectedEntries = [];
	const slots = {
		hd: null,
		key: null,
		devHd: null,
		devKey: null,
		hdList: [],
		keyList: [],
		devHdList: [],
		devKeyList: [],
	};

	for (const [keyId, info] of unlockedKeys.entries()) {
		let meta = null;
		try {
			const metaResult = await walletApp.getKeyMeta({ keyId });
			meta = metaResult?.item ?? null;
		} catch (error) {
			warnings.push(`读取 key 元信息失败 ${keyId}: ${error?.message ?? error}`);
		}

		const entry = {
			keyId,
			name: meta?.name,
			originalName: meta?.name,
			type: meta?.type,
			source: meta?.source,
			sourceFile: meta?.sourceFile,
			unlockedAt: info.unlockedAt,
			expiresAt: info.expiresAt,
			scope: info.scope,
		};
		collectedEntries.push(entry);

		const source = String(meta?.source ?? "file");
		const type = String(meta?.type ?? "").toLowerCase();
		if (source === "dev") {
			if (type === "mnemonic") {
				if (!slots.devHd) slots.devHd = entry;
				slots.devHdList.push(entry);
			} else if (type === "privatekey") {
				if (!slots.devKey) slots.devKey = entry;
				slots.devKeyList.push(entry);
			}
		} else if (type === "mnemonic") {
			if (!slots.hd) slots.hd = entry;
			slots.hdList.push(entry);
		} else if (type === "privatekey") {
			if (!slots.key) slots.key = entry;
			slots.keyList.push(entry);
		}
	}

	// 同名 key 防误用：名称重复时前缀源文件名区分（e.g. wallet-a.enc.json:alice）
	const nameCounts = new Map();
	for (const entry of collectedEntries) {
		const keyName = String(entry.originalName ?? "").trim();
		if (!keyName) continue;
		nameCounts.set(keyName, (nameCounts.get(keyName) ?? 0) + 1);
	}
	for (const entry of collectedEntries) {
		const keyName = String(entry.originalName ?? "").trim();
		if (!keyName || (nameCounts.get(keyName) ?? 0) <= 1) continue;
		const src = String(entry.sourceFile ?? entry.source ?? "unknown");
		entry.name = `${path.basename(src) || src}:${keyName}`;
	}

	return { entries: collectedEntries, slots };
}

// 批量解锁 解锁失败的 filePath 放到 unlockedFails 里
async function unlockWallets(walletApp, filesPath = [], password) {
	const hdList = [];
	const keyList = [];
	const unlocked = {};
	const warnings = [];
	const unlockedFails = [];

	for (const filePath of filesPath) {
		try {
			const result = await unlockWallet(walletApp, filePath, password);
			if (result.ok) {
				hdList.push(...result.hdList);
				keyList.push(...result.keyList);
				Object.assign(unlocked, result.unlocked);
			} else {
				unlockedFails.push(filePath);
			}
			warnings.push(...result.warnings);
		} catch (error) {
			unlockedFails.push(filePath);
			warnings.push(`批量解锁 ${filePath} 异常: ${error?.message ?? error}`);
		}
	}

	return {
		ok: unlockedFails.length === 0,
		hd: hdList[0] ?? null,
		key: keyList[0] ?? null,
		hdList,
		keyList,
		totalRequested: filesPath.length,
		totalUnlocked: filesPath.length - unlockedFails.length,
		totalFailed: unlockedFails.length,
		unlocked,
		unlockedFails,
		warnings,
	};
}

export { unlockWallet, unlockDev, unlockWallets };
