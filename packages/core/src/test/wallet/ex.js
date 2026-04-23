import { createWallet } from "../../apps/wallet/index.mjs";

async function main() {
	const password = process.env.WALLET_PASSWORD;

	if (!password) {
		throw new Error("请先设置环境变量 WALLET_PASSWORD");
	}

	const wallet = createWallet({
		baseDir: process.cwd(),
	});

	console.log("\n1) 加载 key 目录中的加密文件");
	const loaded = await wallet.loadKeyFile({
		password,
		tags: ["demo"],
	});
	console.log(JSON.stringify(loaded, null, 2));

	console.log("\n2) 查看当前已登记的 key");
	const listed = await wallet.listKeys();
	console.log(JSON.stringify(listed, null, 2));

	if (listed.total === 0) {
		console.log("\n未加载到任何 key，脚本结束");
		return;
	}

	const firstKey = listed.items[0];

	console.log("\n3) 查看第一把 key 的元信息");
	const meta = await wallet.getKeyMeta({
		keyId: firstKey.keyId,
	});
	console.log(JSON.stringify(meta, null, 2));

	console.log("\n4) 解锁第一把 key");
	const unlocked = await wallet.unlock({
		keyId: firstKey.keyId,
		password,
		ttlMs: 5 * 60 * 1000,
		reason: "demo",
		scope: {
			chain: "evm",
		},
	});
	console.log(JSON.stringify(unlocked, null, 2));

	console.log("\n5) 再次查看状态，确认已经 unlocked");
	const metaAfterUnlock = await wallet.getKeyMeta({
		keyId: firstKey.keyId,
	});
	console.log(JSON.stringify(metaAfterUnlock, null, 2));

	console.log("\n6) 锁回去");
	const locked = await wallet.lock({
		keyId: firstKey.keyId,
	});
	console.log(JSON.stringify(locked, null, 2));

	console.log("\n7) lockAll 兜底清理 session");
	const lockAllResult = await wallet.lockAll();
	console.log(JSON.stringify(lockAllResult, null, 2));
}

main().catch((error) => {
	console.error("\n运行失败:", error.message);
	process.exitCode = 1;
});
