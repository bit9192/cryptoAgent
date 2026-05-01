
import { createDefaultSearchEngine } from "../apps/search/engine.mjs";

// ─── 工具函数 ───────────────────────────────────────────────

function divider(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📌 ${title}`);
  console.log(`${"─".repeat(60)}\n`);
}

function error(msg) {
  console.log(`❌ ${msg}`);
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

function toJsonSafe(value) {
  return JSON.stringify(
    value,
    (_key, current) => (typeof current === "bigint" ? current.toString() : current),
    2,
  );
}

async function runAssetSearchDemoFromPicked(pickedWallets = []) {
  let requests = [];
  const dedup = new Set();
  for (const picked of Array.isArray(pickedWallets) ? pickedWallets : []) {
    const addresses = picked?.addresses && typeof picked.addresses === "object" ? picked.addresses : {};
    for (const value of Object.values(addresses)) {
      if (typeof value === "string") {
        const query = value.trim();
        if (!query || dedup.has(query)) continue;
        dedup.add(query);
        requests.push({ query });
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const query = String(item?.address ?? "").trim();
          if (!query || dedup.has(query)) continue;
          dedup.add(query);
          requests.push({ query });
        }
      }
    }
  }

  requests = requests.slice(0, 2);
  console.log(requests);
  info(`address-search requests: ${requests.length}`);
  const targetNetworks = ["eth", "bsc"];

  const engine = createDefaultSearchEngine();
  const pairs = requests.flatMap((req) =>
    targetNetworks.map((network) => ({ address: req.query, chain: "evm", network, limit: 200 })),
  );

  const batchResult = await Promise.all(
    pairs.map((input) => engine.asset.byAddress(input)),
  );

  console.log("\n--- search(address-valuation) batch result ---");
  console.log(toJsonSafe(batchResult));
  return batchResult;
}

async function resolveWalletTree(options = {}) {
  const wallet = options?.wallet;
  if (!wallet) {
    return null;
  }

  if (typeof wallet.getTree === "function") {
    try {
      const tree = await wallet.getTree();
      if (tree && Array.isArray(tree?.tree)) {
        return tree;
      }
    } catch {
      // 兼容旧路径，失败时回退到 listKeys + getSessionState
    }
  }

  if (typeof wallet.listKeys !== "function" || typeof wallet.getSessionState !== "function") {
    return null;
  }

  try {
    const listed = await wallet.listKeys({ enabled: true });
    const items = Array.isArray(listed?.items) ? listed.items : [];
    const unlocked = items.filter((item) => String(item?.status ?? "") === "unlocked");

    for (const item of unlocked) {
      const keyId = String(item?.keyId ?? "").trim();
      if (!keyId) continue;
      const state = await wallet.getSessionState({ keyId });
      const tree = state?.tree;
      if (tree && Array.isArray(tree?.tree)) {
        return tree;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function testDebugPickAddressFromInputs(options) {
  divider("调试 B: 从 inputs 提取地址（含 key fallback）");

  const tree = await resolveWalletTree(options);
  if (!tree || !Array.isArray(tree?.tree)) {
    error("未能从 wallet 会话读取到 tree，请先执行 wallet unlock");
    return;
  }
  
  const pickRequestAllChains = {
    scope: "all",
    selectors: {
      // keyId: options?.inputs?.keyId,
      // name: String(options?.inputs?.name ?? "").trim(),
      name: "x",
    //   sourceName: "k",
      // nameExact: Boolean(options?.inputs?.nameExact),
      // keyType: options?.inputs?.keyType,
      // source: options?.inputs?.source,
    },
    outps: {
      signer: true,
    //   chains: "all",
    },
  };

  const pickRequestBtcAllTypes = {
    scope: "all",
    selectors: {
    //   name: "",
        // sourceName: "meer",
        // source: "derive"
    },
    outps: {
      signer: true,
    //   existingOnly: false,
    //   chains: "all"
    //   chains: "default"
      chains: ["evm"]
    //   chains: [
    //     // "trx",
    //     "evm"
    //     // {
    //     //   chain: "btc",
    //     //   addressTypes: "all",
    //     // },
    //   ],
    },
  };

  if (!options?.wallet || typeof options.wallet.pickWallet !== "function") {
    throw new Error("wallet.pickWallet 不可用");
  }

  

  const pickedWalletsAllChains = await options.wallet.pickWallet(pickRequestAllChains, tree);
  const pickedWalletsBtcAllTypes = await options.wallet.pickWallet(pickRequestBtcAllTypes, tree);
  info("pickWallet migration parity: REMOVED (direct wallet.pickWallet)");

  info(`wallet.tree rows: ${Array.isArray(tree?.tree) ? tree.tree.length : 0}`);
  info(`pickWallet rows (chains=all): ${pickedWalletsAllChains.length}`);
  console.log("\n--- Result: chains=all ---");
  console.log(toJsonSafe(pickedWalletsAllChains));

  info(`pickWallet rows (btc.addressTypes=all): ${pickedWalletsBtcAllTypes.length}`);
  console.log("\n--- Result: btc addressTypes=all ---");
  console.log(toJsonSafe(pickedWalletsBtcAllTypes));

  divider("调试 C: pick 结果参数化并调用资产搜索");
  await runAssetSearchDemoFromPicked(pickedWalletsBtcAllTypes);
}

// ─── 主程序 ───────────────────────────────────────────────────

export async function run(options) {
  console.log("\n🔧 Wallet-Engine 测试工具\n");
  const tree = await resolveWalletTree(options);
  info(`wallet.tree rows: ${Array.isArray(tree?.tree) ? tree.tree.length : 0}`);
  await testDebugPickAddressFromInputs(options);

  divider("所有测试完成");
}

