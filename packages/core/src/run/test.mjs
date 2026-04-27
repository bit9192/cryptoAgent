
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

function normalizeChainsFromRequest(chains) {
  if (!Array.isArray(chains) || chains.length === 0) {
    return [];
  }

  const normalized = [];
  for (const item of chains) {
    if (typeof item === "string") {
      const chain = String(item).trim().toLowerCase();
      if (chain) {
        normalized.push({ chain, addressTypes: null });
      }
      continue;
    }

    if (item && typeof item === "object") {
      const chain = String(item.chain ?? "").trim().toLowerCase();
      if (!chain) continue;
      const addressTypes = Array.isArray(item.addressTypes)
        ? item.addressTypes.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
        : null;
      normalized.push({ chain, addressTypes });
    }
  }

  return normalized;
}

function queryKeysWithDataEngine(rows = [], request = {}) {
  const selectors = request?.selectors ?? request?.keyFilters ?? {};

  const keyIdFilter = String(selectors?.keyId ?? "").trim();
  const keyName = String(selectors?.name ?? selectors?.keyName ?? "").trim();
  const keyNameNeedle = keyName.toLowerCase();
  const nameExact = Boolean(selectors?.nameExact);
  const sourceNameFilter = String(selectors?.sourceName ?? "").trim();
  const sourceNameNeedle = sourceNameFilter.toLowerCase();
  const keyTypeFilter = String(selectors?.keyType ?? "").trim();
  const sourceTypeFilter = String(selectors?.source ?? "").trim().toLowerCase();

  return rows
    .map((row) => ({
      keyId: String(row?.keyId ?? "").trim(),
      name: String(row?.name ?? "").trim(),
      sourceName: row?.sourceName ?? null,
      keyType: String(row?.keyType ?? "").trim() || null,
      sourceType: String(row?.sourceType ?? "").trim() || null,
      path: row?.path ?? null,
      addresses: row?.addresses && typeof row.addresses === "object" ? row.addresses : {},
    }))
    .filter((item) => {
      if (!item.keyId) return false;
      if (keyIdFilter && item.keyId !== keyIdFilter) return false;
      if (keyTypeFilter && String(item.keyType ?? "") !== keyTypeFilter) return false;
      if (sourceTypeFilter && String(item.sourceType ?? "").toLowerCase() !== sourceTypeFilter) return false;

      if (keyName || sourceNameFilter) {
        const nameLower = String(item.name ?? "").toLowerCase();
        const snLower = String(item.sourceName ?? "").toLowerCase();

        let nameMatch = true;
        let sourceNameMatch = true;

        if (keyName) {
          if (nameExact) {
            nameMatch = nameLower === keyNameNeedle;
          } else {
            nameMatch = nameLower.includes(keyNameNeedle);
          }
        }

        if (sourceNameFilter) {
          sourceNameMatch = snLower.includes(sourceNameNeedle);
        }

        // 两个条件都传了：取并集（满足一个即可）
        // 只传了一个：只检查那一个
        if (keyName && sourceNameFilter) {
          if (!nameMatch && !sourceNameMatch) return false;
        } else if (keyName) {
          if (!nameMatch) return false;
        } else if (sourceNameFilter) {
          if (!sourceNameMatch) return false;
        }
      }

      return true;
    });
}

async function resolveAddressesForKey(key, requestedChains = [], wallet = null) {
  const existing = key?.addresses && typeof key.addresses === "object" ? key.addresses : {};
  const result = {};

  for (const { chain, addressTypes } of requestedChains) {
    const hasTypedMode = Array.isArray(addressTypes) && addressTypes.length > 0;

    if (!hasTypedMode) {
      // 普通模式：直接用现有地址，没有则尝试生成
      const cur = existing[chain];
      const items = Array.isArray(cur) ? cur : cur ? [cur] : [];
      const filtered = items.map((a) => String(a ?? "").trim()).filter(Boolean);

      if (filtered.length > 0) {
        result[chain] = filtered.length === 1 ? filtered[0] : filtered;
        continue;
      }

      if (wallet && typeof wallet.getSigner === "function") {
        try {
          const { signer } = await wallet.getSigner({ chain, keyId: key.keyId });
          if (signer && typeof signer.getAddress === "function") {
            const addr = await signer.getAddress({});
            const text = String(addr ?? "").trim();
            const value = text || [];
            result[chain] = value;
            continue;
          }
        } catch {
          // getSigner 失败，留空
        }
      }

      result[chain] = [];
      continue;
    }

    // typed 模式：调 getSigner 按 addressType 生成
    if (wallet && typeof wallet.getSigner === "function") {
      try {
        const { signer } = await wallet.getSigner({ chain, keyId: key.keyId });
        if (signer && typeof signer.getAddress === "function") {
          const generated = [];
          for (const addressType of addressTypes) {
            try {
              const addr = await signer.getAddress({ addressType });
              const text = String(addr ?? "").trim();
              if (text && !generated.some((item) => item.address === text && item.type === addressType)) {
                generated.push({ address: text, type: addressType });
              }
            } catch {
              // 跳过单个 addressType 失败
            }
          }
          result[chain] = generated;
          continue;
        }
      } catch {
        // getSigner 失败，留空
      }
    }

    result[chain] = [];
  }

  return result;
}

async function pickWallet(request = {}, tree = {}, wallet = null) {
  const scope = String(request?.scope ?? "single").trim().toLowerCase() || "single";
  const outputs = request.outputs ?? request.outps ?? {};
  const requestedChains = normalizeChainsFromRequest(outputs?.chains);
  const treeRows = Array.isArray(tree?.tree) ? tree.tree : [];
  const selectedKeys = queryKeysWithDataEngine(treeRows, request);

  const keysToProcess = scope === "all" ? selectedKeys : selectedKeys.slice(0, 1);

  const results = await Promise.all(
    keysToProcess.map(async (key) => {
      const addresses = await resolveAddressesForKey(key, requestedChains, wallet);
      return {
        keyId: key.keyId,
        name: key.name,
        keyType: key.keyType,
        sourceType: key.sourceType,
        path: key.path ?? null,
        addresses,
      };
    })
  );

  return results;
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
  
  const pickedWallets = await pickWallet(
    {
      scope: "all",
      selectors: {
        // keyId: options?.inputs?.keyId,
        // name: String(options?.inputs?.name ?? "").trim(),
        name: "meer",
        sourceName: "meer",
        // nameExact: Boolean(options?.inputs?.nameExact),
        // keyType: options?.inputs?.keyType,
        // source: options?.inputs?.source,
      },
      outps: {
        signer: true,
        chains: [
          "evm",
          "trx",
          {
            chain: "btc",
            addressTypes: ["p2wpkh", "p2tr"]
            // addressTypes: Array.isArray(options?.inputs?.addressTypes)
            //   ? options.inputs.addressTypes
            //   : undefined,
          },
        ],
      },
    },
    tree,
    options?.wallet,
  );

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

