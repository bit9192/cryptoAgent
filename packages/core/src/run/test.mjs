
import { createDefaultSearchEngine } from "../modules/search-engine/index.mjs";

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

function mapChainToSearchNetwork(chain) {
  const normalized = String(chain ?? "").trim().toLowerCase();
  if (normalized === "evm") return "eth";
  return normalized;
}

function buildAssetSearchInputsFromPicked(pickedWallets = [], options = {}) {
  const limit = Number(options.limit ?? 20);
  const rows = [];
  const dedup = new Set();

  for (const picked of Array.isArray(pickedWallets) ? pickedWallets : []) {
    const addresses = picked?.addresses && typeof picked.addresses === "object" ? picked.addresses : {};
    for (const [chain, value] of Object.entries(addresses)) {
      const network = mapChainToSearchNetwork(chain);

      if (typeof value === "string") {
        const query = value.trim();
        if (!query) continue;
        const dedupKey = `${network}:${query}`;
        if (dedup.has(dedupKey)) continue;
        dedup.add(dedupKey);
        rows.push({
          domain: "address",
          query,
          network,
          limit,
          chain,
          keyId: picked?.keyId,
          name: picked?.name,
          sourceName: picked?.sourceName,
        });
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          const query = String(item?.address ?? "").trim();
          if (!query) continue;
          const addressType = String(item?.type ?? "").trim() || undefined;
          const dedupKey = `${network}:${query}`;
          if (dedup.has(dedupKey)) continue;
          dedup.add(dedupKey);
          rows.push({
            domain: "address",
            query,
            network,
            limit,
            chain,
            addressType,
            keyId: picked?.keyId,
            name: picked?.name,
            sourceName: picked?.sourceName,
          });
        }
      }
    }
  }

  return rows;
}

async function runAssetSearchDemoFromPicked(pickedWallets = [], options = {}) {
  const searchInputs = buildAssetSearchInputsFromPicked(pickedWallets, {
    limit: options.limit ?? 20,
  });

  info(`asset-search requests: ${searchInputs.length}`);
  console.log("\n--- Parametrized asset-search requests ---");
  console.log(toJsonSafe(searchInputs));
  return
  const searchEngine = options.searchEngine ?? createDefaultSearchEngine();
  const search = typeof searchEngine?.search === "function" ? searchEngine.search.bind(searchEngine) : null;
  if (!search) {
    error("searchEngine.search 不可用，跳过下游资产搜索");
    return [];
  }

  const maxRequests = Number(options.maxRequests ?? 3);
  const requests = searchInputs.slice(0, Math.max(0, maxRequests));
  const settled = await Promise.allSettled(requests.map((input) => search(input)));

  const summary = settled.map((item, index) => {
    const req = requests[index];
    if (item.status === "fulfilled") {
      const result = item.value;
      const count = Array.isArray(result?.items) ? result.items.length : 0;
      return {
        ok: true,
        network: req.network,
        query: req.query,
        addressType: req.addressType,
        count,
      };
    }
    return {
      ok: false,
      network: req.network,
      query: req.query,
      addressType: req.addressType,
      error: item.reason?.message ?? String(item.reason ?? "unknown error"),
    };
  });

  console.log("\n--- Asset-search result summary ---");
  console.log(toJsonSafe(summary));
  return summary;
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
    sourceName: "meer",
      source: "derive"
    },
    outps: {
      signer: true,
    //   existingOnly: false,
    //   chains: "all"
    //   chains: "default"
    //   chains: ["evm"]
      chains: [
        "trx",
        {
          chain: "btc",
          addressTypes: "all",
        },
      ],
    },
  };

  if (!options?.wallet || typeof options.wallet.pickWallet !== "function") {
    throw new Error("wallet.pickWallet 不可用");
  }

  

  const pickedWalletsAllChains = await options.wallet.pickWallet(pickRequestAllChains, tree);
  const pickedWalletsBtcAllTypes = await options.wallet.pickWallet(pickRequestBtcAllTypes, tree);
  info("pickWallet migration parity: REMOVED (direct wallet.pickWallet)");
console.log(
    toJsonSafe(pickedWalletsBtcAllTypes),
    "123213"
  )

  return 
  info(`wallet.tree rows: ${Array.isArray(tree?.tree) ? tree.tree.length : 0}`);
  info(`pickWallet rows (chains=all): ${pickedWalletsAllChains.length}`);
  console.log("\n--- Result: chains=all ---");
  console.log(toJsonSafe(pickedWalletsAllChains));

  info(`pickWallet rows (btc.addressTypes=all): ${pickedWalletsBtcAllTypes.length}`);
  console.log("\n--- Result: btc addressTypes=all ---");
  console.log(toJsonSafe(pickedWalletsBtcAllTypes));

  divider("调试 C: pick 结果参数化并调用资产搜索");
  await runAssetSearchDemoFromPicked(pickedWalletsBtcAllTypes, {
    searchEngine: options?.searchEngine,
    limit: 20,
    maxRequests: 2,
  });
}

// ─── 主程序 ───────────────────────────────────────────────────

export async function run(options) {
  console.log("\n🔧 Wallet-Engine 测试工具\n");
  const tree = await resolveWalletTree(options);
  info(`wallet.tree rows: ${Array.isArray(tree?.tree) ? tree.tree.length : 0}`);
  await testDebugPickAddressFromInputs(options);

  divider("所有测试完成");
}

