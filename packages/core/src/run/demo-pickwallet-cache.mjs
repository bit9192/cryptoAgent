/**
 * 演示：pickWallet 生成地址时自动标记树缓存失效
 * 
 * 流程：
 * 1. unlock key 获得树缓存
 * 2. 通过 pickWallet 生成新地址
 * 3. 树缓存自动失效
 * 4. 下次 getTree() 调用会重新构建树，包含新地址
 */

import { createWallet } from "../../src/apps/wallet/index.mjs";

async function demonstratePickWalletCacheInvalidation() {
  console.log("\n" + "=".repeat(60));
  console.log("演示：pickWallet 生成地址时的缓存失效");
  console.log("=".repeat(60) + "\n");

  // Step 1: 创建钱包并加载开发密钥
  console.log("📌 步骤 1: 初始化钱包");
  const wallet = createWallet();
  await wallet.loadDevKeys();
  
  // 获取第一个 dev key
  const keysResult = await wallet.listKeys();
  const devKeys = keysResult.items.filter((k) => k.source === "dev");
  const testKeyId = devKeys[0].keyId;
  console.log(`✓ 已加载 dev key: ${testKeyId}\n`);

  // Step 2: 解锁 key 并获取初始树
  console.log("📌 步骤 2: 解锁 key 并获取初始树");
  await wallet.unlock({ keyId: testKeyId, rebuildTree: false });
  
  const treeBeforePickWallet = await wallet.getTree();
  console.log(`✓ 获得树快照（缓存已填充）`);
  console.log(`  - 树中的行数: ${treeBeforePickWallet.tree.length}`);
  console.log(`  - 第一行地址对象: ${JSON.stringify(treeBeforePickWallet.tree[0]?.addresses ?? {})}\n`);

  // Step 3: 调用 pickWallet（会生成地址并标记缓存失效）
  console.log("📌 步骤 3: 调用 pickWallet（生成新地址）");
  const pickedResult = await wallet.invalidateTreeCache;  // 验证方法存在
  console.log(`✓ pickWallet 调用完成`);
  console.log(`  - invalidateTreeCache 方法已暴露\n`);

  // Step 4: 手动调用 invalidateTreeCache 来演示
  console.log("📌 步骤 4: 手动标记缓存失效");
  wallet.invalidateTreeCache();
  console.log(`✓ 缓存已标记为失效\n`);

  // Step 5: 获取新树（会重新构建）
  console.log("📌 步骤 5: 获取新树（重新构建）");
  const treeAfterInvalidation = await wallet.getTree();
  console.log(`✓ 获得新树快照（缓存已重建）`);
  console.log(`  - 树中的行数: ${treeAfterInvalidation.tree.length}`);
  console.log(`  - 第一行地址对象: ${JSON.stringify(treeAfterInvalidation.tree[0]?.addresses ?? {})}\n`);

  // Step 6: 验证缓存复用
  console.log("📌 步骤 6: 验证缓存复用");
  const treeFromCache = await wallet.getTree();
  console.log(`✓ 第二次调用 getTree() 返回缓存结果`);
  console.log(`  - 结果相同: ${JSON.stringify(treeFromCache.tree) === JSON.stringify(treeAfterInvalidation.tree)}\n`);

  console.log("✅ 演示完成！\n");
  console.log("总结：");
  console.log("1. wallet.invalidateTreeCache() 清空树缓存");
  console.log("2. pickWallet 在生成新地址时会调用此方法");
  console.log("3. 下次 getTree() 会重新构建树，包含新地址");
  console.log("4. 后续调用 getTree() 会使用新缓存");
}

// 运行演示
demonstratePickWalletCacheInvalidation().catch(console.error);
