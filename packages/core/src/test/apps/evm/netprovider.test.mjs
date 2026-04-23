import test from "node:test";
import assert from "node:assert/strict";
import {
  writeEvmForkState,
  clearEvmForkState,
} from "../../../apps/evm/fork/node.mjs";

import {
  createEvmNetProvider,
  resolveEvmNetProvider,
} from "../../../apps/evm/netprovider.mjs";

test("evm netprovider: 可创建 fork provider", async () => {
  const provider = createEvmNetProvider({ networkName: "fork" });

  assert.equal(provider.chain, "evm");
  assert.equal(provider.networkName, "fork");
  assert.equal(provider.chainId, 31337);
  assert.equal(typeof provider.rpcUrl, "string");
  assert.ok(provider.provider, "应包含底层 provider");
});

test("evm netprovider: fork provider 应暴露源链元数据", async (t) => {
  await writeEvmForkState({
    sourceNetwork: "eth",
    sourceChainId: 1,
    sourceRpcUrl: "https://eth.example.rpc",
    localRpcUrl: "http://127.0.0.1:8545",
    localChainId: 31337,
    blockNumber: 999,
  });
  t.after(async () => {
    await clearEvmForkState();
  });

  const provider = createEvmNetProvider({ networkName: "fork" });
  assert.equal(provider.forkMode, true);
  assert.equal(provider.forkSourceNetwork, "eth");
  assert.equal(provider.forkSourceChainId, 1);
  assert.equal(provider.gasToken, "ETH");
});

test("evm netprovider: resolve 对已创建 provider 直接返回", async () => {
  const created = createEvmNetProvider({ networkName: "fork" });
  const resolved = resolveEvmNetProvider(created);
  assert.equal(resolved, created);
});

test("evm netprovider: resolve 可包装裸 provider", async () => {
  const created = createEvmNetProvider({ networkName: "fork" });
  const resolved = resolveEvmNetProvider(created.provider, { networkName: "fork" });

  assert.equal(resolved.chain, "evm");
  assert.equal(resolved.networkName, "fork");
  assert.ok(resolved.provider);
});
