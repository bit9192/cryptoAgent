import { parseBtcAddress, convertBtcAddressNetwork, normalizeBtcAddressNetworkName } from "../address.mjs";

/**
 * 根据 parsed 结果判断地址类型（friendlyName）
 */
function resolveAddressType(parsed) {
  if (parsed.format === "base58") {
    return parsed.kind; // "p2pkh" | "p2sh"
  }
  // bech32
  if (parsed.witnessVersion === 0) return "p2wpkh";
  if (parsed.witnessVersion === 1) return "p2tr";
  return `segwit_v${parsed.witnessVersion}`;
}

/**
 * 根据地址类型判断能力列表。
 *
 * BRC20 / Ordinals 依赖 Taproot (P2TR, bech32 v1)。
 * 其他格式只能持有 native BTC。
 */
function resolveCapabilities(parsed) {
  const caps = ["native"];
  if (parsed.format === "bech32" && parsed.witnessVersion === 1) {
    caps.push("brc20");
  }
  return caps;
}

/**
 * 分类一个 BTC 地址：
 * - 解析格式、网络、地址类型
 * - 推断或验证 network（若指定则转换地址格式）
 * - 返回能力列表（决定查询哪些协议）
 *
 * @param {string} addressInput BTC 地址
 * @param {string|null} requestedNetwork mainnet / testnet / regtest，空则从地址推断
 * @returns {{
 *   originalAddress: string,
 *   address: string,      // 已转换到目标网络的地址（若无转换则与原始相同）
 *   sourceNetwork: string,
 *   network: string,      // 实际使用的网络
 *   addressType: string,  // p2pkh / p2sh / p2wpkh / p2tr
 *   format: string,
 *   capabilities: string[], // ["native"] 或 ["native", "brc20"]
 * }}
 */
export function classifyBtcAddress(addressInput, requestedNetwork = null) {
  const parsed = parseBtcAddress(addressInput);
  const sourceNetwork = parsed.network;
  const addressType = resolveAddressType(parsed);
  const capabilities = resolveCapabilities(parsed);

  // 未指定 network → 直接使用从地址推断的网络
  if (!requestedNetwork) {
    return {
      originalAddress: parsed.address,
      address: parsed.address,
      sourceNetwork,
      network: sourceNetwork,
      addressType,
      format: parsed.format,
      capabilities,
    };
  }

  // 指定了 network → 规范化后，若与源网络不同则转换地址
  const normalizedTarget = normalizeBtcAddressNetworkName(requestedNetwork);

  if (normalizedTarget === sourceNetwork) {
    return {
      originalAddress: parsed.address,
      address: parsed.address,
      sourceNetwork,
      network: normalizedTarget,
      addressType,
      format: parsed.format,
      capabilities,
    };
  }

  // 转换地址到目标网络格式
  const converted = convertBtcAddressNetwork(parsed.address, normalizedTarget);
  return {
    originalAddress: parsed.address,
    address: converted.output,
    sourceNetwork,
    network: normalizedTarget,
    addressType,
    format: parsed.format,
    capabilities,
  };
}

export default {
  classifyBtcAddress,
};
