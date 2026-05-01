import { createDefaultSearchEngine } from "../../../apps/search/engine.mjs";

// 预置 happy-path 样本行（来自 test.data.md happy 段）
// token 字段必须是合约地址（TRC20/ERC20）或 "native"，不能是 symbol
const SAMPLE_ROWS = [
  // TRX - USDT (TRC20 合约地址)
  { chain: "trx", network: "mainnet", address: "TPsMJ3BE9ixSQ7guFbVLZ4eou6SATBSqHH", token: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },
  // TRX - SUN token (TRC20 合约地址)
  { chain: "trx", network: "mainnet", address: "TPsMJ3BE9ixSQ7guFbVLZ4eou6SATBSqHH", token: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S" },
  // TRX - TRX native
  { chain: "trx", network: "mainnet", address: "TLaGjwhvA8XQYSxFAcAXy7Dvuue9eGYitv", token: "native" },
  // BTC - ORDI
  { chain: "btc", network: "mainnet", address: "bc1ps793rn2savj7u7stawzly7uua62nuay7pzq027ck8hfrdzffdnnqf3gegf", token: "ordi" },
  // BTC - SATS
  { chain: "btc", network: "mainnet", address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6", token: "sats" },
  // EVM ETH - USDT (ERC20 合约地址)
  { chain: "evm", network: "eth", address: "0x6Fb8aa6fc6f27e591423009194529aE126660027", token: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
  // EVM ETH - ETH native
  { chain: "evm", network: "eth", address: "0x436693FF266F9E495dbD1DCa2f48B65B03Dc0198", token: "native" },
];

function formatResult(r) {
  if (!r) return "(null result)";
  const ok = r.ok ? "✔" : "✖";
  const chain = String(r.chain ?? "-");
  const network = String(r.network ?? "-");
  const address = String(r.address ?? "-");
  const token = String(r.token ?? "-");
  const rawBalance = r.rawBalance != null ? `rawBalance=${r.rawBalance}` : "";
  const error = r.error ? `error=${r.error}` : "";
  const extra = rawBalance || error || "";
  return `${ok} [${chain}:${network}] ${address} token=${token}${extra ? "  " + extra : ""}`;
}

async function main() {
  // 支持单行 CLI 覆盖: node run.balance.test.mjs <chain> <network> <address> <token>
  const args = process.argv.slice(2);
  let rows;

  if (args.length >= 4) {
    rows = [
      {
        chain: args[0].trim(),
        network: args[1].trim(),
        address: args[2].trim(),
        token: args[3].trim(),
      },
    ];
  } else if (args.length > 0) {
    console.error("Usage: node run.balance.test.mjs [chain network address token]");
    console.error("       (no args = run all sample rows)");
    console.error("Example: node run.balance.test.mjs trx mainnet TPsMJ3BE9ixSQ7guFbVLZ4eou6SATBSqHH USDT");
    process.exitCode = 1;
    return;
  } else {
    rows = SAMPLE_ROWS;
  }

  const engine = createDefaultSearchEngine();

  console.log("=== apps/search balance.batch ===");
  console.log(`rows=${rows.length}`);
  console.log("");

  const results = await engine.balance.batch(rows);

  for (let i = 0; i < results.length; i++) {
    console.log(`[${i}] ${formatResult(results[i])}`);
  }

  const okCount = results.filter((r) => r?.ok).length;
  const failCount = results.length - okCount;
  console.log("");
  console.log(`--- 汇总: ${okCount} ok / ${failCount} fail / ${results.length} total ---`);
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
