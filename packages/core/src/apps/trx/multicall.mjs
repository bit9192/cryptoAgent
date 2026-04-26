import { Interface } from "ethers";

import { resolveTrxNetProvider } from "./netprovider.mjs";
import { toEthHexAddress, toTrxBase58Address, toTrxHexAddress } from "./address-codec.mjs";

export const TRX_MULTICALL_ADDRESSES = Object.freeze({
  mainnet: "TYPACdASdAe4ZjcACwHscmqy6KCssP2jDt",
});

const TRX_MULTICALL_ABI = [
  "function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)",
  "function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)",
];

const TRX_MULTICALL_INTERFACE = new Interface(TRX_MULTICALL_ABI);

function selectorOf(method) {
  const frag = TRX_MULTICALL_INTERFACE.getFunction(method);
  return `${frag.name}(${frag.inputs.map((item) => item.type).join(",")})`;
}

function ensureCallArray(input = []) {
  if (!Array.isArray(input)) {
    throw new Error("multicall 输入必须是数组");
  }
  return input;
}

function normalizeMulticallAddress(provider, options = {}) {
  if (options.multicall === false) {
    return null;
  }

  const explicit = String(options.multicallAddress ?? "").trim();
  if (explicit) {
    return toTrxBase58Address(explicit);
  }

  return TRX_MULTICALL_ADDRESSES[String(provider?.networkName ?? "").trim().toLowerCase()] ?? null;
}

function normalizeOwnerAddress(multicallAddress, options = {}) {
  const candidate = String(options.callerAddress ?? options.ownerAddress ?? multicallAddress ?? "").trim();
  if (!candidate) {
    throw new Error("缺少 multicall callerAddress");
  }
  return toTrxBase58Address(candidate);
}

function normalizeRequest(request = {}) {
  const targetAddress = String(request.targetAddress ?? request.target ?? request.address ?? "").trim();
  const iface = request.iface;
  const method = String(request.method ?? "").trim();
  const args = Array.isArray(request.args) ? request.args : [];

  if (!targetAddress) throw new Error("multicall targetAddress 不能为空");
  if (!iface || typeof iface.encodeFunctionData !== "function") throw new Error("multicall iface 无效");
  if (!method) throw new Error("multicall method 不能为空");

  return {
    targetAddress: toTrxBase58Address(targetAddress),
    iface,
    method,
    args,
  };
}

async function triggerMulticall(provider, multicallAddress, ownerAddress, method, calls) {
  const data = TRX_MULTICALL_INTERFACE.encodeFunctionData(method, method === "tryAggregate"
    ? [false, calls]
    : [calls]);

  const result = await provider.walletCall("triggerconstantcontract", {
    owner_address: toTrxHexAddress(ownerAddress),
    contract_address: toTrxHexAddress(multicallAddress),
    function_selector: selectorOf(method),
    parameter: data.slice(10),
    visible: false,
  });

  const hex = result?.constant_result?.[0];
  if (!hex) {
    throw new Error(`trx multicall 失败: ${JSON.stringify(result)}`);
  }
  return TRX_MULTICALL_INTERFACE.decodeFunctionResult(method, `0x${hex}`);
}

export async function queryTrxMulticall(input = [], options = {}) {
  const requests = ensureCallArray(input).map((item) => normalizeRequest(item));
  if (requests.length === 0) {
    return { ok: true, used: false, items: [] };
  }

  const provider = resolveTrxNetProvider(
    options.networkNameOrProvider ?? options.netProvider ?? options.networkName ?? options.network ?? null,
  );
  const multicallAddress = normalizeMulticallAddress(provider, options);
  if (!multicallAddress) {
    return {
      ok: false,
      used: false,
      items: [],
      error: `TRX multicall 未配置: ${provider.networkName}`,
    };
  }

  const ownerAddress = normalizeOwnerAddress(multicallAddress, options);
  const calls = requests.map((request) => ({
    target: toEthHexAddress(request.targetAddress),
    callData: request.iface.encodeFunctionData(request.method, request.args),
  }));

  try {
    const [rows] = await triggerMulticall(provider, multicallAddress, ownerAddress, "tryAggregate", calls);
    return {
      ok: true,
      used: true,
      items: rows.map((row, index) => {
        if (!row?.success) {
          return {
            ok: false,
            value: null,
            error: "subcall failed",
          };
        }

        try {
          const decoded = requests[index].iface.decodeFunctionResult(requests[index].method, row.returnData);
          return {
            ok: true,
            value: decoded.length <= 1 ? decoded[0] : Array.from(decoded),
            error: null,
          };
        } catch (error) {
          return {
            ok: false,
            value: null,
            error: error?.message ?? String(error),
          };
        }
      }),
    };
  } catch (firstError) {
    try {
      const [, rows] = await triggerMulticall(provider, multicallAddress, ownerAddress, "aggregate", calls);
      return {
        ok: true,
        used: true,
        items: rows.map((returnData, index) => {
          try {
            const decoded = requests[index].iface.decodeFunctionResult(requests[index].method, returnData);
            return {
              ok: true,
              value: decoded.length <= 1 ? decoded[0] : Array.from(decoded),
              error: null,
            };
          } catch (error) {
            return {
              ok: false,
              value: null,
              error: error?.message ?? String(error),
            };
          }
        }),
      };
    } catch {
      return {
        ok: false,
        used: true,
        items: [],
        error: firstError?.message ?? String(firstError),
      };
    }
  }
}

export default {
  TRX_MULTICALL_ADDRESSES,
  queryTrxMulticall,
};