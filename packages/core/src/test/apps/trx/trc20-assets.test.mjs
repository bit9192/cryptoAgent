import test from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";

import {
  queryTrxTokenMetadata,
  queryTrxTokenMetadataBatch,
  queryTrxTokenBalance,
  queryTrxTokenBalanceBatch,
} from "../../../apps/trx/trc20.mjs";
import { toTrxBase58Address, toTrxHexAddress } from "../../../apps/trx/address-codec.mjs";

const TRC20_INTERFACE = new Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

const TRX_MULTICALL_INTERFACE = new Interface([
  "function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)",
]);

const TRX_MULTICALL_MAINNET = "TYPACdASdAe4ZjcACwHscmqy6KCssP2jDt";

function selectorOf(method) {
  const frag = TRC20_INTERFACE.getFunction(method);
  return `${frag.name}(${frag.inputs.map((i) => i.type).join(",")})`;
}

function selectorOfWithInterface(iface, method) {
  const frag = iface.getFunction(method);
  return `${frag.name}(${frag.inputs.map((i) => i.type).join(",")})`;
}

function createTrxProviderMock({
  metadataTable = {},
  balanceTable = {},
  nativeTable = {},
  networkName = "nile",
  multicallAddress = TRX_MULTICALL_MAINNET,
  multicallFailures = [],
  multicallThrows = false,
} = {}) {
  const stats = {
    singleCalls: 0,
    multicallCalls: 0,
  };
  const failedSet = new Set(multicallFailures.map((item) => String(item).trim().toUpperCase()));

  const provider = {
    networkName,
    __stats: stats,
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
      const contractBase58 = /^41[0-9A-F]{40}$/.test(contractHex)
        ? toTrxBase58Address(contractHex)
        : null;
      const fn = String(payload?.function_selector ?? "").trim();

      if (fn === selectorOfWithInterface(TRX_MULTICALL_INTERFACE, "tryAggregate")) {
        stats.multicallCalls += 1;
        if (multicallThrows) {
          throw new Error("multicall failed");
        }

        const selector = TRX_MULTICALL_INTERFACE.encodeFunctionData("tryAggregate", [false, []]).slice(0, 10);
        const decoded = TRX_MULTICALL_INTERFACE.decodeFunctionData(
          "tryAggregate",
          `${selector}${String(payload?.parameter ?? "")}`,
        );
        const calls = Array.isArray(decoded?.[1]) ? decoded[1] : [];
        const results = calls.map((call) => {
          const targetHex = `41${String(call.target ?? "").replace(/^0x/i, "").toUpperCase()}`;
          const targetBase58 = toTrxBase58Address(targetHex);
          if (failedSet.has(targetHex)) {
            return { success: false, returnData: "0x" };
          }

          const parsed = TRC20_INTERFACE.parseTransaction({ data: call.callData });
          const meta = metadataTable[targetHex] ?? metadataTable[targetBase58] ?? metadataTable["*"];
          if (!meta || !parsed) {
            return { success: false, returnData: "0x" };
          }

          if (parsed.name === "name") {
            return {
              success: true,
              returnData: TRC20_INTERFACE.encodeFunctionResult("name", [meta.name]),
            };
          }
          if (parsed.name === "symbol") {
            return {
              success: true,
              returnData: TRC20_INTERFACE.encodeFunctionResult("symbol", [meta.symbol]),
            };
          }
          if (parsed.name === "decimals") {
            return {
              success: true,
              returnData: TRC20_INTERFACE.encodeFunctionResult("decimals", [meta.decimals]),
            };
          }
          return { success: false, returnData: "0x" };
        });

        return {
          constant_result: [TRX_MULTICALL_INTERFACE.encodeFunctionResult("tryAggregate", [results]).slice(2)],
        };
      }

      if (fn === selectorOf("name")) {
        stats.singleCalls += 1;
        const meta = metadataTable[contractHex] ?? (contractBase58 ? metadataTable[contractBase58] : null) ?? metadataTable["*"];
        if (!meta) return { result: { result: false } };
        return {
          constant_result: [TRC20_INTERFACE.encodeFunctionResult("name", [meta.name]).slice(2)],
        };
      }

      if (fn === selectorOf("symbol")) {
        stats.singleCalls += 1;
        const meta = metadataTable[contractHex] ?? (contractBase58 ? metadataTable[contractBase58] : null) ?? metadataTable["*"];
        if (!meta) return { result: { result: false } };
        return {
          constant_result: [TRC20_INTERFACE.encodeFunctionResult("symbol", [meta.symbol]).slice(2)],
        };
      }

      if (fn === selectorOf("decimals")) {
        stats.singleCalls += 1;
        const meta = metadataTable[contractHex] ?? (contractBase58 ? metadataTable[contractBase58] : null) ?? metadataTable["*"];
        if (!meta) return { result: { result: false } };
        return {
          constant_result: [TRC20_INTERFACE.encodeFunctionResult("decimals", [meta.decimals]).slice(2)],
        };
      }

      if (fn === selectorOf("balanceOf")) {
        stats.singleCalls += 1;
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

  return provider;
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

test("trx token metadata: batch uses multicall on mainnet", async () => {
  const tokenA = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const tokenB = "TMacq4TDUw5q8NFBwmbY4RLXvzvG5JTkvi";
  const provider = createTrxProviderMock({
    networkName: "mainnet",
    metadataTable: {
      [tokenA]: { name: "Token A", symbol: "TKA", decimals: 6 },
      [tokenB]: { name: "Token B", symbol: "TKB", decimals: 18 },
    },
  });

  const res = await queryTrxTokenMetadataBatch([
    { token: tokenA },
    { token: tokenB },
  ], {
    networkNameOrProvider: provider,
  });

  assert.equal(res.ok, true);
  assert.equal(res.items[0].ok, true);
  assert.equal(res.items[1].ok, true);
  assert.equal(provider.__stats.multicallCalls, 1);
  assert.equal(provider.__stats.singleCalls, 0);
});

test("trx token metadata: multicall partial failure falls back per token", async () => {
  const tokenA = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const tokenB = "TMacq4TDUw5q8NFBwmbY4RLXvzvG5JTkvi";
  const provider = createTrxProviderMock({
    networkName: "mainnet",
    metadataTable: {
      [tokenA]: { name: "Token A", symbol: "TKA", decimals: 6 },
      [tokenB]: { name: "Token B", symbol: "TKB", decimals: 18 },
    },
    multicallFailures: [toTrxHexAddress(tokenB)],
  });

  const res = await queryTrxTokenMetadataBatch([
    { token: tokenA },
    { token: tokenB },
  ], {
    networkNameOrProvider: provider,
  });

  assert.equal(res.items[0].ok, true);
  assert.equal(res.items[1].ok, true);
  assert.equal(res.items[1].symbol, "TKB");
  assert.equal(provider.__stats.multicallCalls, 1);
  assert.equal(provider.__stats.singleCalls, 3);
});

test("trx token metadata: multicall throw falls back to single path", async () => {
  const tokenA = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const tokenB = "TMacq4TDUw5q8NFBwmbY4RLXvzvG5JTkvi";
  const provider = createTrxProviderMock({
    networkName: "mainnet",
    metadataTable: {
      [tokenA]: { name: "Token A", symbol: "TKA", decimals: 6 },
      [tokenB]: { name: "Token B", symbol: "TKB", decimals: 18 },
    },
    multicallThrows: true,
  });

  const res = await queryTrxTokenMetadataBatch([
    { token: tokenA },
    { token: tokenB },
  ], {
    networkNameOrProvider: provider,
  });

  assert.equal(res.items[0].ok, true);
  assert.equal(res.items[1].ok, true);
  assert.equal(provider.__stats.multicallCalls, 1);
  assert.equal(provider.__stats.singleCalls, 6);
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
