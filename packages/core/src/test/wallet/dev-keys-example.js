/**
 * Dev Keys 使用示例
 *
 * 演示如何在 wallet 中使用预定义的开发用密钥（mnemonic + private keys）
 * 这些 key 无需密码即可使用，适合开发、测试环境
 */

import { createWallet } from "../../apps/wallet/index.mjs";

async function demonstrateDevKeys() {
  console.log("========== Wallet Dev Keys 演示 ==========\n");

  // 1️⃣ 创建钱包实例
  const wallet = createWallet({
    baseDir: process.cwd(),
  });

  // 2️⃣ 加载所有预定义的开发用密钥
  console.log("📦 加载所有 dev keys...");
  const loadedAll = await wallet.loadDevKeys();
  console.log(`   ✅ 已加载 ${loadedAll.loaded} 个 dev keys\n`);

  // 3️⃣ 列出所有已加载的密钥
  console.log("📋 所有已加载的密钥：");
  const allKeys = await wallet.listKeys();
  for (const item of allKeys.items) {
    console.log(`   • ${item.name}`);
    console.log(`     ID: ${item.keyId}`);
    console.log(`     Type: ${item.type}`);
    console.log(`     Source: ${item.source || "file"}`);
    console.log(`     Status: ${item.status}`);
    console.log(`     Tags: ${item.tags.join(", ") || "无"}`);
    console.log("");
  }

  // 4️⃣ 选择性加载特定的 dev keys
  console.log("🎯 选择性加载特定 dev keys...");
  const wallet2 = createWallet({ baseDir: process.cwd() });
  const partialLoad = await wallet2.loadDevKeys({
    names: ["hardhat-default", "hardhat-account-0"],
    tags: ["selected"],
  });
  console.log(`   ✅ 已加载 ${partialLoad.loaded} 个指定的 dev keys\n`);

  const selectedList = await wallet2.listKeys({ tags: ["selected"] });
  console.log("   已加载的密钥：");
  for (const item of selectedList.items) {
    console.log(`   • ${item.name} (${item.type})`);
  }
  console.log("");

  // 5️⃣ 演示 dev key 的无密码解锁
  console.log("🔓 演示无密码解锁 dev key...");
  const devKeyList = await wallet.listKeys({ tags: ["dev"] });
  if (devKeyList.items.length > 0) {
    const firstDevKey = devKeyList.items[0];
    console.log(`   正在解锁: ${firstDevKey.name}`);

    // Dev keys 不需要密码！
    const unlockResult = await wallet.unlock({
      keyId: firstDevKey.keyId,
      ttlMs: 30 * 60 * 1000,  // 30 分钟 TTL
      reason: "演示解锁",
    });

    console.log(`   ✅ 成功解锁`);
    console.log(`      keyId: ${unlockResult.keyId}`);
    console.log(`      unlockedAt: ${unlockResult.unlockedAt}`);
    console.log(`      expiresAt: ${unlockResult.expiresAt}`);
    console.log(`      source: ${unlockResult.source || "N/A"}`);

    // 6️⃣ 获取 key 详细信息
    console.log("📋 密钥详细信息：");
    const metaResult = await wallet.getKeyMeta({ keyId: firstDevKey.keyId });
    const meta = metaResult.item;
    console.log(`   • 名称: ${meta.name}`);
    console.log(`   • 类型: ${meta.type}`);
    console.log(`   • 来源: ${meta.source || "file"}`);
    console.log(`   • 状态: ${meta.status}`);
    console.log(`   • 启用: ${meta.enabled ? "是" : "否"}`);
    console.log(`   • 标签: ${meta.tags.join(", ") || "无"}`);
    console.log(`   • 创建时间: ${meta.createdAt}`);
    console.log("");

    // 7️⃣ 锁定单个密钥
    console.log("🔒 锁定密钥...");
    const lockResult = await wallet.lock({ keyId: firstDevKey.keyId });
    console.log(`   ✅ 已锁定: ${lockResult.keyId}\n`);

    // 8️⃣ 检查状态变化
    const statusAfterLock = await wallet.getKeyMeta({ keyId: firstDevKey.keyId });
    console.log(`   解锁前状态: unlocked`);
    console.log(`   解锁后状态: ${statusAfterLock.item.status}\n`);
  }

  // 9️⃣ 演示 reload 标志
  console.log("🔄 演示 reload 标志（重新加载已存在的 keys）...");
  const reloadResult = await wallet.loadDevKeys({
    reload: true,
    tags: ["reloaded"],
  });
  console.log(`   ✅ 重新加载了 ${reloadResult.loaded} 个 keys`);
  console.log(`   📝 已跳过 ${reloadResult.skippedKeyIds.length} 个重复的 keys\n`);

  // 🔟 演示一键全部解锁和锁定
  console.log("🔓 一键全部解锁所有 dev keys...");
  const wallet3 = createWallet({ baseDir: process.cwd() });
  await wallet3.loadDevKeys();

  const allDevKeys = await wallet3.listKeys();
  for (const key of allDevKeys.items) {
    if (key.source === "dev") {
      await wallet3.unlock({
        keyId: key.keyId,
        reason: "批量演示解锁",
      });
      console.log(`   ✅ ${key.name}`);
    }
  }
  console.log("");

  console.log("🔒 一键全部锁定...");
  const lockAllResult = await wallet3.lockAll();
  console.log(`   ✅ 已锁定 ${lockAllResult.count} 个会话\n`);

  console.log("========== 演示完成 ==========");
}

demonstrateDevKeys().catch((error) => {
  console.error("❌ 错误:", error.message);
  process.exitCode = 1;
});
