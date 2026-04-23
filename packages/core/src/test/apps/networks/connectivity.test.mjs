import test from "node:test";
import assert from "node:assert/strict";

import { JsonRpcProvider } from "ethers";
import { getEvmNetworkConfig } from "../../../apps/evm/configs/networks.js";
import { getBtcNetworkConfig } from "../../../apps/btc/config/networks.js";
import { getTrxNetworkConfig } from "../../../apps/trx/config/networks.js";

function buildBasicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function isLocalhostRpc(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

test("networks/evm: 默认网络可连接并读取区块", { timeout: 20000 }, async (t) => {
  const cfg = getEvmNetworkConfig();
  if (!String(cfg.rpc || "").trim()) {
    t.skip("EVM 默认网络未配置 RPC。请先设置 EVM_NETWORK 对应的 RPC 环境变量后再跑。");
    return;
  }

  const provider = new JsonRpcProvider(cfg.rpc);

  const blockNumber = await provider.getBlockNumber();
  assert.equal(typeof blockNumber, "number");
  assert.ok(blockNumber > 0);

  const block = await provider.getBlock(blockNumber);
  assert.ok(block);
  assert.equal(typeof block.number, "number");
});

test("networks/btc: 默认网络可连接并读取链信息", { timeout: 20000 }, async (t) => {
  const cfg = getBtcNetworkConfig();
  const isLocalRpc = isLocalhostRpc(cfg.rpcUrl);

  const body = {
    jsonrpc: "1.0",
    id: "core-btc-network-test",
    method: "getblockchaininfo",
    params: [],
  };

  let response;
  try {
    response = await fetch(cfg.rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: buildBasicAuthHeader(cfg.rpcUsername, cfg.rpcPassword),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (isLocalRpc) {
      t.skip("本地 BTC 节点未启动。请先运行 btc:node start，或配置远端 BTC RPC 后再跑。");
      return;
    }
    throw error;
  }

  assert.equal(response.ok, true, `BTC RPC 请求失败: HTTP ${response.status}`);

  const payload = await response.json();
  assert.equal(Boolean(payload?.error), false, `BTC RPC 返回错误: ${JSON.stringify(payload?.error ?? null)}`);
  assert.equal(typeof payload?.result?.chain, "string");
});

test("networks/trx: 默认网络可连接并读取当前区块", { timeout: 20000 }, async () => {
  const cfg = getTrxNetworkConfig();

  const response = await fetch(`${cfg.rpcUrl}/wallet/getnowblock`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.apiKey ? { "TRON-PRO-API-KEY": cfg.apiKey } : {}),
    },
    body: "{}",
  });

  assert.equal(response.ok, true, `TRX RPC 请求失败: HTTP ${response.status}`);

  const payload = await response.json();
  const blockNumber = payload?.block_header?.raw_data?.number;
  assert.equal(typeof blockNumber, "number");
  assert.ok(blockNumber > 0);
});
