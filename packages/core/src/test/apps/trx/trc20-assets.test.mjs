import test from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";

import {
  queryTrxTokenMetadata,
  queryTrxTokenMetadataBatch,
  queryTrxTokenBalance,
  queryTrxTokenBalanceBatch,
} from "../../../apps/trx/trc20.mjs";

const TRC20_INTERFACE = new Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

function selectorOf(method) {
  const frag = TRC20_INTERFACE.getFunction(method);
  return `${frag.name}(${frag.inputs.map((i) => i.type).join(",")})`;
}

function createTrxProviderMock({ metadataTable = {}, balanceTable = {}, nativeTable = {} } = {}) {
  return {
    networkName: "nile",
    async walletCall(method, payload) {
      if (method === "getaccount") {
        const ownerHex = String(payload?.address ?? "").toUpperCase();
        const balance = nativeTable[ownerHex] ?? nativeTable["*"] ?? 0;
        return { balance: Number(balance) };
      }

      if (method !== "triggerconstantcontract") {
        throw new Error(`unexpected method: ${method}`);
      }

      const contractHex = String(payload?.contract_address ?? "").toUpperCase();
      const fn = String(payload?.function_selector ?? "").trim();

      if (fn === selectorOf("name")) {
        const meta = metadataTable[contractHex] ?? metadataTable["*"];
        if (!meta) return { result: { result: false } };
        return {
          constant_result: [TRC20_INTERFACE.encodeFunctionResult("name", [meta.name]).slice(2)],
        };
      }

      if (fn === selectorOf("symbol")) {
        const meta = metadataTable[contractHex] ?? metadataTable["*"];
        if (!meta) return { result: { result: false } };
        return {
          constant_result: [TRC20_INTERFACE.encodeFunctionResult("symbol", [meta.symbol]).slice(2)],
        };
      }

      if (fn === selectorOf("decimals")) {
        const meta = metadataTable[contractHex] ?? metadataTable["*"];
        if (!meta) return { result: { result: false } };
        return {
          constant_result: [TRC20_INTERFACE.encodeFunctionResult("decimals", [meta.decimals]).slice(2)],
        };
      }

      if (fn === selectorOf("balanceOf")) {
        const parameter = String(payload?.parameter ?? "").toLowerCase();
        const ownerEth = `0x${parameter.slice(-40)}`;
        const key = `${contractHex}:${ownerEth}`;
        const value = balanceTable[key] ?? balanceTable[`${contractHex}:*`] ?? balanceTable["*"];
        if (value == null) {
          return { result: { result: false } };
        }
        return {
          constant_result: [TRC20_INTERFACE.encodeFunctionResult("balanceOf", [BigInt(value)]).slice(2)],
        };
      }

      throw new Error(`unexpected selector: ${fn}`);
    },
  };
}

test("trx token metadata: supports single query", async () => {
  const token = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  const provider = createTrxProviderMock({
    metadataTable: {
      "*": {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
      },
    },
  });

  const item = await queryTrxTokenMetadata({
    tokenAddress: token,
    networkNameOrProvider: provider,
  });

  assert.equal(item.chain, "trx");
  assert.equal(item.tokenAddress, token);
  assert.equal(item.name, "Tether USD");
  assert.equal(item.symbol, "USDT");
  assert.equal(item.decimals, 6);
});

test("trx token metadata: batch supports partial failure", async () => {
  const provider = createTrxProviderMock({
    metadataTable: {
      "*": {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
      },
    },
  });

  const res = await queryTrxTokenMetadataBatch([
    { token: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" },
    { token: "bad-token" },
  ], {
    networkNameOrProvider: provider,
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].ok, true);
  assert.equal(res.items[0].symbol, "USDT");
  assert.equal(res.items[1].ok, false);
});

test("trx token balance: supports single query", async () => {
  const token = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  const owner = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  const provider = createTrxProviderMock({
    balanceTable: {
      "*": 12345n,
    },
  });

  const item = await queryTrxTokenBalance({
    address: owner,
    token,
    networkNameOrProvider: provider,
  });

  assert.equal(item.chain, "trx");
  assert.equal(item.ownerAddress, owner);
  assert.equal(item.tokenAddress, token);
  assert.equal(item.balance, 12345n);
});

test("trx token balance: supports native marker", async () => {
  const owner = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  const provider = createTrxProviderMock({
    nativeTable: {
      "*": 99000000,
    },
  });

  const item = await queryTrxTokenBalance({
    address: owner,
    token: "native",
    networkNameOrProvider: provider,
  });

  assert.equal(item.tokenAddress, "native");
  assert.equal(item.balance, 99000000n);
});

test("trx token balance: batch supports partial failure", async () => {
  const token = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  const provider = createTrxProviderMock({
    balanceTable: {
      "*": 77n,
    },
  });

  const res = await queryTrxTokenBalanceBatch([
    { address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", token },
    { address: "bad-address", token: "bad-token" },
  ], {
    networkNameOrProvider: provider,
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].ok, true);
  assert.equal(res.items[0].balance, 77n);
  assert.equal(res.items[1].ok, false);
});

test("trx token balance: batch input must be array", async () => {
  await assert.rejects(
    async () => await queryTrxTokenBalanceBatch({ items: [] }, {}),
    /数组/,
  );
});
