/**
 * src/run/test.mjs  —  Wallet-Engine 测试工具
 * 
 * 可在 Lon REPL 中运行: run test
 * 或使用完整路径:      n packages/core/src/run/test.mjs
 */

import { 
  retrieveWalletCandidates, 
  generateAddressFromCandidates, 
  generateSignerFromCandidates,
  resolveSearchAddressRequest,
  resolveSignerRefs,
} from "../../packages/core/src/modules/wallet-engine/index.mjs";
import { showInputs } from "../../packages/core/src/modules/inputs/index.mjs";

// ─── 工具函数 ───────────────────────────────────────────────

function divider(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📌 ${title}`);
  console.log(`${"─".repeat(60)}\n`);
}

function success(msg) {
  console.log(`✅ ${msg}`);
}

function error(msg) {
  console.log(`❌ ${msg}`);
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

// ─── 创建 mock 钱包状态 ───────────────────────────────────────

function createMockWalletStatus() {
  return {
    sessionId: "default",
    addresses: [
      // k1 EVM 地址
      {
        keyId: "k1",
        keyName: "alpha",
        chain: "evm",
        address: "0x1111111111111111111111111111111111111111",
        name: "main",
        path: "m/44'/60'/0'/0/0",
        signerRef: "evm:k1:main",
        signerType: "ethers-signer",
      },
      {
        keyId: "k1",
        keyName: "alpha",
        chain: "evm",
        address: "0x2222222222222222222222222222222222222222",
        name: "alt",
        path: "m/44'/60'/0'/0/1",
        signerRef: "evm:k1:alt",
        signerType: "ethers-signer",
      },
      // k2 TRX 地址
      {
        keyId: "k2",
        keyName: "beta",
        chain: "trx",
        address: "TQN7UoUE3oMF4GV7Hm2uC6Kz8gHqBdL7Cv",
        name: "trx-main",
        path: "m/44'/195'/0'/0/0",
        signerRef: "trx:k2:main",
        signerType: "tronweb-signer",
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────────
// 核心 API 测试（低级接口）
// ────────────────────────────────────────────────────────────────

async function testRetrieveByName(walletStatus) {
  divider("测试 1: 检索候选地址（按名称）");
  
  try {
    const candidates = retrieveWalletCandidates(
      { name: "main", nameExact: true }, 
      walletStatus
    );
    
    success(`找到 ${candidates.length} 个候选`);
    console.log(JSON.stringify(candidates, null, 2));
    
    return candidates;
  } catch (err) {
    error(`${err.message}`);
    return [];
  }
}

async function testGenerateAddressSingle(candidates) {
  divider("测试 2: 生成单个地址（single 模式）");
  
  if (candidates.length === 0) {
    error("没有候选可用");
    return null;
  }
  
  try {
    const result = generateAddressFromCandidates(
      candidates,
      { cardinality: "single" }
    );
    
    success("地址生成成功");
    console.log(JSON.stringify(result, null, 2));
    
    return result;
  } catch (err) {
    error(`${err.message}`);
    return null;
  }
}

async function testGenerateSignerSingle(walletStatus) {
  divider("测试 3: 生成单个 Signer（single 模式）");
  
  try {
    const candidates = retrieveWalletCandidates(
      { keyId: "k1", chain: "evm", name: "main", nameExact: true },
      walletStatus
    );
    
    if (candidates.length === 0) {
      error("没有候选可用");
      return null;
    }
    
    const result = generateSignerFromCandidates(
      candidates,
      { cardinality: "single" }
    );
    
    success("Signer 生成成功");
    info(`signerRef: ${result.signerRefs?.[0]}`);
    info(`signerType: ${result.signerTypes?.[0]}`);
    console.log(JSON.stringify(result, null, 2));
    
    return result;
  } catch (err) {
    error(`${err.message}`);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
// 下游接口测试（高级接口）
// ────────────────────────────────────────────────────────────────

async function testDownstreamSearch(walletStatus) {
  divider("下游接口 1: Search（查询资产）");
  
  info("场景：用户运行 si token --network eth，输入中包含 keyId=\"k1\", chain=\"evm\"");
  
  try {
    const result = resolveSearchAddressRequest({
      // 用户设置的输入（比如 wallet inputs.set）
      inputs: {
        keyId: "k1",
        chain: "evm",
      },
      // 钱包状态
      walletStatus,
      // 输出要求
      requirement: {
        kind: "address",
        cardinality: "single",
      },
    });
    
    if (result.ok) {
      success("地址解析成功");
      info(`📍 查询地址: ${result.query}`);
      info(`🔗 链网络: ${result.chain}`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      error(`解析失败: ${result.error}`);
    }
  } catch (err) {
    error(`${err.message}`);
  }
}

async function testDownstreamSend(walletStatus) {
  divider("下游接口 2: Send（发送交易）");
  
  info("场景：用户要发送交易，需要特定 chain 的 signer");
  
  try {
    const result = resolveSignerRefs({
      // 用户指定：使用 k1 的 EVM signer
      inputs: {
        keyId: "k1",
        chain: "evm",
      },
      walletStatus,
      requirement: {
        kind: "signer",
        cardinality: "single",
      },
    });
    
    if (result.ok) {
      success("Signer 解析成功");
      info(`✍️  signerRef: ${result.signerRefs?.[0]}`);
      info(`🔐 signerType: ${result.signerTypes?.[0]}`);
      info(`📍 地址: ${result.addresses?.[0]}`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      error(`解析失败: ${result.error}`);
    }
  } catch (err) {
    error(`${err.message}`);
  }
}

async function testDownstreamMultiAddress(walletStatus) {
  divider("下游接口 3: MultiAddress（批量查询）");
  
  info("场景：查询同一个 keyId 下的所有地址");
  
  try {
    const result = resolveSearchAddressRequest({
      inputs: {
        keyId: "k1",  // 可能有多个地址
      },
      walletStatus,
      requirement: {
        kind: "address",
        cardinality: "multi",  // 需要多个结果
      },
    });
    
    if (result.ok) {
      success(`地址解析成功 (${result.addresses.length} 个)`);
      for (const addr of result.addresses) {
        console.log(`  - ${addr.address} (${addr.chain})`);
      }
      console.log(JSON.stringify(result, null, 2));
    } else {
      error(`解析失败: ${result.error}`);
    }
  } catch (err) {
    error(`${err.message}`);
  }
}

async function testDownstreamCrossChain(walletStatus) {
  divider("下游接口 4: CrossChain（跨链操作）");
  
  info("场景：用户要在 TRX 链上操作，需要 k2 的 signer");
  
  try {
    const result = resolveSignerRefs({
      inputs: {
        keyId: "k2",
        chain: "trx",
      },
      walletStatus,
      requirement: {
        kind: "signer",
        cardinality: "single",
      },
    });
    
    if (result.ok) {
      success("跨链 Signer 解析成功");
      info(`✍️  signerRef: ${result.signerRefs?.[0]}`);
      info(`🔗 链网络: ${result.chain}`);
      info(`📍 地址: ${result.addresses?.[0]}`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      error(`解析失败: ${result.error}`);
    }
  } catch (err) {
    error(`${err.message}`);
  }
}

async function testDownstreamNamedWallet(walletStatus) {
  divider("下游接口 5: NamedWallet（按名称查询）");
  
  info("场景：用户只知道钱包名称 'alt'，不知道 keyId");
  
  try {
    const result = resolveSearchAddressRequest({
      inputs: {
        name: "alt",  // 按名称查询
        nameExact: false,  // 模糊匹配
      },
      walletStatus,
      requirement: {
        kind: "address",
        cardinality: "single",
      },
    });
    
    if (result.ok) {
      success("地址解析成功（按名称）");
      info(`📍 查询地址: ${result.query}`);
      info(`📝 名称: ${result.addresses?.[0]?.name}`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      error(`解析失败: ${result.error}`);
    }
  } catch (err) {
    error(`${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────
// 错误场景测试
// ──────────────────────────────────────────────────────────────

async function testErrorScenarios(walletStatus) {
  divider("错误处理：多候选冲突");
  
  info("场景 1: 使用不足的过滤条件导致多候选");
  
  try {
    // 只指定 keyId，但 k1 有 2 个 EVM 地址
    const result = resolveSearchAddressRequest({
      inputs: {
        keyId: "k1",
        chain: "evm",
        // 缺少 name 过滤，会导致 2 个候选
      },
      walletStatus,
      requirement: {
        kind: "address",
        cardinality: "single",  // 期望 1 个
      },
    });
    
    if (result.ok) {
      success("意外成功");
    } else {
      error(`预期的错误: ${result.error.code}`);
      info(`错误信息: ${result.error.message}`);
    }
  } catch (err) {
    info(`捕获异常: ${err.code}`);
    info(`异常信息: ${err.message}`);
  }
  
  info("\n场景 2: 无匹配结果");
  
  try {
    const result = resolveSearchAddressRequest({
      inputs: {
        name: "nonexistent",  // 不存在的名称
      },
      walletStatus,
      requirement: {
        kind: "address",
        cardinality: "single",
      },
    });
    
    if (result.ok) {
      success("意外成功");
    } else {
      error(`预期的错误: ${result.error.code}`);
      info(`错误信息: ${result.error.message}`);
    }
  } catch (err) {
    info(`捕获异常: ${err.code}`);
    info(`异常信息: ${err.message}`);
  }
}

// ─── 主程序 ───────────────────────────────────────────────────

export async function run(options = {}) {
  console.log("\n🔧 Wallet-Engine 完整测试套件\n");
  
  // 提取 inputs（如果有的话）
  const inputs = options.inputs;
  
  if (inputs) {
    divider("📍 当前 Inputs");
    console.log(JSON.stringify(inputs, null, 2));
  } else {
    divider("ℹ️ 提示");
    info("没有设置 inputs，可以运行：");
    info("  wallet inputs.set wallet --data '{...}'");
  }
  
  // 创建 mock 钱包状态
  const walletStatus = createMockWalletStatus();
  
  // ── 低级 API 测试
  console.log("\n\n" + "═".repeat(60));
  console.log("部分 1️⃣ : 核心 API（低级接口）");
  console.log("═".repeat(60));
  
  const candidates1 = await testRetrieveByName(walletStatus);
  await testGenerateAddressSingle(candidates1);
  await testGenerateSignerSingle(walletStatus);
  
  // ── 高级接口测试
  console.log("\n\n" + "═".repeat(60));
  console.log("部分 2️⃣ : 下游接口测试（高级）");
  console.log("═".repeat(60));
  
  await testDownstreamSearch(walletStatus);
  await testDownstreamSend(walletStatus);
  await testDownstreamMultiAddress(walletStatus);
  await testDownstreamCrossChain(walletStatus);
  await testDownstreamNamedWallet(walletStatus);
  
  // ── 错误处理测试
  console.log("\n\n" + "═".repeat(60));
  console.log("部分 3️⃣ : 错误处理");
  console.log("═".repeat(60));
  
  await testErrorScenarios(walletStatus);
  
  divider("所有测试完成");
  console.log("\n💡 下一步：\n");
  console.log("  1. 查看下游接口文档了解各个场景的参数要求");
  console.log("  2. 修改测试中的 inputs 来验证不同的过滤条件");
  console.log("  3. 运行 run test 来快速迭代和调试\n");
}
