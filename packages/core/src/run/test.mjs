
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
  
  const pickRequest = {
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
      chains: ["btc"]
    //   chains: [
    //     "evm",
    //     "trx",
    //     {
    //       chain: "btc",
    //       addressTypes: ["p2wpkh", "p2tr"],
    //       // addressTypes: Array.isArray(options?.inputs?.addressTypes)
    //       //   ? options.inputs.addressTypes
    //       //   : undefined,
    //     },
    //   ],
    },
  };

  if (!options?.wallet || typeof options.wallet.pickWallet !== "function") {
    throw new Error("wallet.pickWallet 不可用");
  }

  const pickedWallets = await options.wallet.pickWallet(pickRequest, tree);
  info("pickWallet migration parity: REMOVED (direct wallet.pickWallet)");

  info(`wallet.tree rows: ${Array.isArray(tree?.tree) ? tree.tree.length : 0}`);
  info(`pickWallet rows: ${pickedWallets.length}`);
  console.log(toJsonSafe(pickedWallets));
}

// ─── 主程序 ───────────────────────────────────────────────────

export async function run(options) {
  console.log("\n🔧 Wallet-Engine 测试工具\n");
  const tree = await resolveWalletTree(options);
  info(`wallet.tree rows: ${Array.isArray(tree?.tree) ? tree.tree.length : 0}`);
  await testDebugPickAddressFromInputs(options);

  divider("所有测试完成");
}

