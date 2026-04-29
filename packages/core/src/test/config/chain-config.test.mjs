import test from "node:test";
import assert from "node:assert/strict";
import {
  writeEvmForkState,
  clearEvmForkState,
} from "../../apps/evm/fork/node.mjs";

import {
  getEvmNetworkConfig,
  listEvmNetworksByScope,
  normalizeEvmNetworkScope,
  normalizeEvmNetworkName,
  getEvmContractBook,
  resolveEvmContract,
  getEvmAddressBook,
  resolveEvmAddress,
  getEvmTokenBook,
  resolveEvmToken,
} from "../../apps/evm/index.mjs";
import {
  getBtcNetworkConfig,
  listBtcNetworksByScope,
  normalizeBtcNetworkScope,
  normalizeBtcNetworkName,
  getBtcTokenBook,
  resolveBtcToken,
} from "../../apps/btc/index.mjs";
import {
  getTrxNetworkConfig,
  listTrxNetworksByScope,
  normalizeTrxNetworkScope,
  normalizeTrxNetworkName,
  getTrxTokenBook,
  resolveTrxToken,
} from "../../apps/trx/index.mjs";

test("evm config: 支持网络名归一化与默认网络读取", async () => {
  assert.equal(normalizeEvmNetworkScope("mainnet"), "mainnet");
  assert.equal(normalizeEvmNetworkScope("testnet"), "fork");
  assert.equal(normalizeEvmNetworkScope("fork"), "fork");
  assert.equal(normalizeEvmNetworkName("mainnet"), "eth");
  assert.equal(normalizeEvmNetworkName("testnet"), "fork");
  assert.equal(normalizeEvmNetworkName("hardhat"), "fork");
  assert.deepEqual(listEvmNetworksByScope("testnet"), ["fork"]);

  const evmMainnets = listEvmNetworksByScope("mainnet");
  assert.ok(evmMainnets.includes("eth"));
  assert.ok(evmMainnets.includes("bsc"));

  const bsc = getEvmNetworkConfig("bsc");
  assert.equal(bsc.chainId, 56);
  assert.equal(bsc.chainType, "l1");
  assert.equal(bsc.isForkable, true);
  assert.equal(typeof bsc.etherscan.apiURL, "string");
  assert.equal(typeof bsc.rpc, "string");
});

test("evm defaults: 可按 network/chainId 读取常用地址并支持 env 覆盖", async () => {
  const bscContracts = getEvmContractBook({ network: "bsc" });
  assert.equal(bscContracts.chainId, 56);
  assert.ok(bscContracts.contracts.multicall3);

  const fromContractResolver = resolveEvmContract({ network: "bsc", key: "multicall3" });
  assert.equal(fromContractResolver.toLowerCase(), bscContracts.contracts.multicall3.toLowerCase());

  const bscBook = getEvmAddressBook({ network: "bsc" });
  assert.equal(bscBook.chainId, 56);
  assert.ok(bscBook.addresses.multicall3);

  const previous = process.env.TEST_MULTICALL3;
  process.env.TEST_MULTICALL3 = "0x1111111111111111111111111111111111111111";

  const fromEnv = resolveEvmAddress({
    network: "bsc",
    key: "multicall3",
    envKey: "TEST_MULTICALL3",
  });
  assert.equal(fromEnv.toLowerCase(), "0x1111111111111111111111111111111111111111");

  if (typeof previous === "string") {
    process.env.TEST_MULTICALL3 = previous;
  } else {
    delete process.env.TEST_MULTICALL3;
  }
});

test("chain token config: 支持 EVM/TRX/BTC 默认 token 元数据", async () => {
  const bscUsdt = resolveEvmToken({ network: "bsc", key: "usdt" });
  assert.equal(bscUsdt.symbol, "USDT");
  assert.equal(bscUsdt.decimals, 18);
  assert.equal(bscUsdt.address.toLowerCase(), "0x55d398326f99059ff775485246999027b3197955");

  const nileUsdt = resolveTrxToken({ network: "nile", key: "usdt" });
  assert.equal(nileUsdt.symbol, "USDT");
  assert.equal(nileUsdt.decimals, 6);
  assert.equal(nileUsdt.address, "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");

  const btcBook = getBtcTokenBook({ network: "mainnet" });
  assert.ok(btcBook.tokens.ordi);
  assert.ok(btcBook.tokens.sats);
  assert.ok(btcBook.tokens.rats);

  const ordi = resolveBtcToken({ network: "mainnet", key: "ordi" });
  assert.equal(ordi.symbol, "ORDI");
  assert.equal(ordi.address, "ordi");

  const evmBook = getEvmTokenBook({ network: "eth" });
  assert.ok(evmBook.tokens.usdt);

  const trxBook = getTrxTokenBook({ network: "mainnet" });
  assert.ok(trxBook.tokens.usdt);
});

test("evm fork config: 31337 作为虚拟链时应继承源链 token/contract 配置", async (t) => {
  await writeEvmForkState({
    sourceNetwork: "bsc",
    sourceChainId: 56,
    sourceRpcUrl: "https://bsc.example.rpc",
    localRpcUrl: "http://127.0.0.1:8545",
    localChainId: 31337,
    blockNumber: 123456,
  });
  t.after(async () => {
    await clearEvmForkState();
  });

  const forkCfg = getEvmNetworkConfig("fork");
  assert.equal(forkCfg.chainId, 31337);
  assert.equal(forkCfg.forkSourceNetwork, "bsc");
  assert.equal(forkCfg.forkSourceChainId, 56);
  assert.equal(forkCfg.gasToken, "BNB");

  const forkContracts = getEvmContractBook({ network: "fork" });
  assert.equal(forkContracts.chainId, 31337);
  assert.equal(forkContracts.sourceChainId, 56);
  assert.equal(
    forkContracts.contracts.multicall3.toLowerCase(),
    "0xca11bde05977b3631167028862be2a173976ca11",
  );

  const forkToken = resolveEvmToken({ network: "fork", key: "usdt" });
  assert.equal(forkToken.symbol, "USDT");
  assert.equal(forkToken.decimals, 18);
  assert.equal(forkToken.address.toLowerCase(), "0x55d398326f99059ff775485246999027b3197955");
});

test("btc/trx config: 支持网络名归一化和配置读取", async () => {
  assert.equal(normalizeBtcNetworkScope("mainnet"), "mainnet");
  assert.equal(normalizeBtcNetworkScope("testnet"), "testnet");
  assert.equal(normalizeBtcNetworkScope("fork"), "regtest");
  assert.deepEqual(listBtcNetworksByScope("mainnet"), ["mainnet"]);
  assert.deepEqual(listBtcNetworksByScope("testnet"), ["testnet"]);
  assert.deepEqual(listBtcNetworksByScope("fork"), ["regtest"]);
  assert.equal(normalizeBtcNetworkName("fork"), "regtest");

  assert.equal(normalizeTrxNetworkScope("mainnet"), "mainnet");
  assert.equal(normalizeTrxNetworkScope("testnet"), "nile");
  assert.equal(normalizeTrxNetworkScope("fork"), "nile");
  assert.deepEqual(listTrxNetworksByScope("mainnet"), ["mainnet"]);
  assert.deepEqual(listTrxNetworksByScope("testnet"), ["nile"]);
  assert.deepEqual(listTrxNetworksByScope("fork"), ["nile"]);
  assert.equal(normalizeTrxNetworkName("testnet"), "nile");
  assert.equal(normalizeTrxNetworkName("fork"), "nile");

  assert.equal(normalizeBtcNetworkName("main"), "mainnet");
  assert.equal(normalizeTrxNetworkName("sha"), "shasta");

  const btc = getBtcNetworkConfig("regtest");
  assert.equal(btc.networkName, "regtest");
  assert.equal(btc.chain, "btc");
  assert.equal(btc.addressFormat, "mixed");
  assert.ok(["bitcoind", "mempool", "blockbook", "blockchair"].includes(btc.providerType));
  assert.equal(typeof btc.restUrl, "string");
  assert.equal(typeof btc.apiKey, "string");
  assert.equal(btc.isPublicTestnet, false);
  assert.equal(typeof btc.rpcUrl, "string");

  const btcSignet = getBtcNetworkConfig("signet");
  assert.ok(["bitcoind", "mempool", "blockbook", "blockchair"].includes(btcSignet.providerType));
  assert.equal(btcSignet.isPublicTestnet, true);
  assert.equal(typeof btcSignet.restUrl, "string");

  const trx = getTrxNetworkConfig("mainnet");
  assert.equal(trx.networkName, "mainnet");
  assert.equal(typeof trx.rpcUrl, "string");
});
