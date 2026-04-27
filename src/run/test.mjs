/**
 * src/run/test.mjs  —  Wallet-Engine 测试工具
 * 
 * 可在 Lon REPL 中运行: run test
 * 或使用完整路径:      n packages/core/src/run/test.mjs
 */

import { 
  retrieveWalletCandidates, 
  generateAddressFromCandidates, 
  generateSignerFromCandidates 
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

// ─── 测试 1：查看当前 inputs ───────────────────────────────────

async function testShowInputs(inputs) {
  divider("测试 1: 查看当前 inputs");
  
  if (inputs) {
    success("从 run() 上下文中找到 inputs");
    console.log(JSON.stringify(inputs, null, 2));
  } else {
    info("当前没有设置 inputs，可以先运行：");
    info("  wallet inputs.set wallet --data '{\"address\":\"0x...\",\"chain\":\"evm\"}'");
  }
}

// ─── 测试 2：创建 mock 钱包状态 ───────────────────────────────

function createMockWalletStatus() {
  divider("测试 2: 创建 mock 钱包状态");
  
  const walletStatus = {
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
  
  success("Mock 钱包状态已创建");
  console.log(JSON.stringify(walletStatus, null, 2));
  
  return walletStatus;
}

// ─── 测试 3: 检索候选地址（按名称）───────────────────────────

async function testRetrieveByName(walletStatus) {
  divider("测试 3: 检索候选地址（按名称 'main'）");
  
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

// ─── 测试 4: 生成地址（single 模式）───────────────────────────

async function testGenerateAddressSingle(candidates) {
  divider("测试 4: 从候选生成地址（single 模式）");
  
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

// ─── 测试 5: 生成地址（multi 模式）───────────────────────────

async function testGenerateAddressMulti(walletStatus) {
  divider("测试 5: 生成多个地址（multi 模式）");
  
  try {
    // 先检索所有 k1 的候选
    const candidates = retrieveWalletCandidates(
      { keyId: "k1" },
      walletStatus
    );
    
    if (candidates.length === 0) {
      error("没有候选可用");
      return null;
    }
    
    const result = generateAddressFromCandidates(
      candidates,
      { cardinality: "multi" }
    );
    
    success(`生成 ${result.addresses.length} 个地址`);
    console.log(JSON.stringify(result, null, 2));
    
    return result;
  } catch (err) {
    error(`${err.message}`);
    return null;
  }
}

// ─── 测试 6: 生成 Signer（single 模式）───────────────────────

async function testGenerateSignerSingle(walletStatus) {
  divider("测试 6: 生成 Signer（single 模式）");
  
  try {
    // 检索 k1 的 EVM signer
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

// ─── 测试 7: 检索条件组合 ─────────────────────────────────────

async function testRetrieveCombinations(walletStatus) {
  divider("测试 7: 检索条件组合测试");
  
  const cases = [
    { label: "按 keyId", filters: { keyId: "k2" } },
    { label: "按 chain", filters: { chain: "evm" } },
    { label: "按 keyId + chain", filters: { keyId: "k1", chain: "evm" } },
    { label: "模糊名称搜索", filters: { name: "alt", nameExact: false } },
    { label: "获取全部", filters: { mode: "all" } },
  ];
  
  for (const { label, filters } of cases) {
    try {
      const candidates = retrieveWalletCandidates(filters, walletStatus);
      info(`${label}: 找到 ${candidates.length} 个候选`);
    } catch (err) {
      error(`${label}: ${err.message}`);
    }
  }
}

// ─── 主程序 ───────────────────────────────────────────────────

export async function run(options = {}) {
  console.log("\n🔧 Wallet-Engine 测试工具\n");
  
  // 提取 inputs（如果有的话）
  const inputs = options.inputs;
  
  // 测试 1：查看 inputs
  await testShowInputs(inputs);
  
  // 创建 mock 钱包状态（后续测试用）
  const walletStatus = createMockWalletStatus();
  
  // 测试 2：按名称检索
  const candidates1 = await testRetrieveByName(walletStatus);
  
  // 测试 3：生成单个地址
  await testGenerateAddressSingle(candidates1);
  
  // 测试 4：生成多个地址
  await testGenerateAddressMulti(walletStatus);
  
  // 测试 5：生成 Signer
  await testGenerateSignerSingle(walletStatus);
  
  // 测试 6：检索条件组合
  await testRetrieveCombinations(walletStatus);
  
  divider("所有测试完成");
  console.log("\n💡 提示：\n");
  console.log("  1. 测试中使用了 mock 钱包状态");
  console.log("  2. 如果你已设置 wallet inputs，可以修改测试代码来使用真实数据");
  console.log("  3. 在 REPL 中运行: run test 来执行这个脚本\n");
}
