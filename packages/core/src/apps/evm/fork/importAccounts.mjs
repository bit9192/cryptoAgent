import "../../../load-env.mjs";

import { ethers } from "ethers";
import hre from "hardhat";

const importedSignerCache = new Map();

/**
 * 装饰 EVM Signer，添加元数据和增强功能
 * @param {object} signer - ethers 的 signer 对象
 * @param {object} meta - 元数据配置
 * @returns {object} 装饰后的 signer
 */
function decorateEvmSigner(signer, meta = {}) {
    if (!signer || typeof signer !== "object") {
        return signer;
    }

    const originalGetAddress = typeof signer.getAddress === "function"
        ? signer.getAddress.bind(signer)
        : async () => signer.address;

    signer.remark = String(meta.remark ?? signer.remark ?? "").trim();
    signer.seedType = String(meta.seedType ?? signer.seedType ?? "privateKey").trim() || "privateKey";
    signer.path = String(meta.path ?? signer.path ?? "").trim() || null;
    signer.source = String(meta.source ?? signer.source ?? "").trim() || "unknown";
    signer.fileName = String(meta.fileName ?? signer.fileName ?? "").trim();
    signer.mnemonic = String(meta.mnemonic ?? signer.mnemonic ?? "").replace(/\s+/g, " ").trim() || null;
    signer.netProvider = meta.netProvider ?? signer.netProvider ?? null;

    try {
        signer.privateKey = String(meta.privateKey ?? signer.privateKey ?? "").trim();
    } catch {
        // JsonRpcSigner 没有可写 privateKey，保持只读
    }

    signer.privateKeyRaw = String(meta.privateKeyRaw ?? signer.privateKeyRaw ?? signer.privateKey ?? "").trim() || null;
    signer.privateKeyFormat = String(meta.privateKeyFormat ?? signer.privateKeyFormat ?? "hex").trim() || "hex";
    signer.release = typeof meta.release === "function"
        ? meta.release
        : typeof signer.release === "function"
            ? signer.release
            : null;

    if (typeof signer.release === "function" && !signer.__releaseWrapped) {
        const originalSignTransaction = typeof signer.signTransaction === "function"
            ? signer.signTransaction.bind(signer)
            : null;
        const originalSendTransaction = typeof signer.sendTransaction === "function"
            ? signer.sendTransaction.bind(signer)
            : null;
        const originalSignMessage = typeof signer.signMessage === "function"
            ? signer.signMessage.bind(signer)
            : null;

        if (originalSignTransaction) {
            signer.signTransaction = async (...args) => {
                try {
                    return await originalSignTransaction(...args);
                } finally {
                    signer.release?.();
                }
            };
        }

        if (originalSendTransaction) {
            signer.sendTransaction = async (...args) => {
                try {
                    return await originalSendTransaction(...args);
                } finally {
                    signer.release?.();
                }
            };
        }

        if (originalSignMessage) {
            signer.signMessage = async (...args) => {
                try {
                    return await originalSignMessage(...args);
                } finally {
                    signer.release?.();
                }
            };
        }

        signer.__releaseWrapped = true;
    }

    signer.getAddress = async (id, pathValue, addressType) => {
        if (id === undefined && pathValue === undefined && addressType === undefined) {
            return await originalGetAddress();
        }
        return signer;
    };

    return signer;
}

/**
 * 内部：冒充指定地址
 * @param {string} address - 要冒充的地址
 * @returns {object} 装饰后的 signer
 * @throws {Error} 如果不在支持 impersonate 的 Hardhat 环境中
 */
async function _ImportAddress(address) {
    // ─── 检查 Hardhat 环境 ─────────────────────────────────────────
    let provider = null;
    
    // 方案 1: 尝试使用 hre.network.provider（Hardhat 测试框架）
    if (hre?.network?.provider && typeof hre.network.provider.request === "function") {
        provider = hre.network.provider;
    }
    // 方案 2: 备选方案 - 直接通过 JSON-RPC 连接到 fork node
    else if (typeof fetch === "function") {
        // 创建一个 JSON-RPC provider 包装器
        let requestId = 1;
        provider = {
            request: async (payload) => {
                const jsonRpcPayload = {
                    jsonrpc: "2.0",
                    id: requestId++,
                    ...payload,
                };
                const response = await fetch("http://127.0.0.1:8545", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(jsonRpcPayload),
                });
                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error.message || JSON.stringify(data.error));
                }
                return data.result;
            }
        };
    }
    else {
        throw new Error(
            "ImportAddress：无法找到支持的 provider。\n" +
            "解决方案：\n" +
            "  1. 方案 A（推荐）：使用 Hardhat 测试框架\n" +
            "     命令：npx hardhat test src/test/apps/evm/dapps/swaps.test.mjs\n" +
            "  2. 方案 B：使用 node --test 但需要 fork 节点运行\n" +
            "     1. 启动 fork：npm run fork\n" +
            "     2. 运行测试：node --test src/test/apps/evm/dapps/swaps.test.mjs\n" +
            "  3. 方案 C：检查 Node.js 版本（需要支持全局 fetch）"
        );
    }

    // ─── 尝试 hardhat_impersonateAccount RPC ──────────────────────
    try {
        const result = await provider.request({
            method: "hardhat_impersonateAccount",
            params: [address],
        });
        
        // 检查结果是否成功
        if (result === null || result === undefined) {
            throw new Error("hardhat_impersonateAccount 返回无效结果");
        }
    } catch (rpcError) {
        // 诊断 RPC 错误
        const errorMsg = rpcError?.message ?? String(rpcError);
        
        if (errorMsg.includes("method not found")) {
            throw new Error(
                "ImportAddress：RPC 不支持 hardhat_impersonateAccount 方法。\n" +
                "当前连接：" + (hre.network.config?.url ?? "localhost") + "\n" +
                "解决方案：\n" +
                "  1. 启动 Hardhat fork 节点：npm run fork\n" +
                "  2. 确保在另一个终端运行测试\n" +
                "  3. 检查 RPC 地址是否正确（应为 127.0.0.1:8545）"
            );
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("connect")) {
            throw new Error(
                "ImportAddress：无法连接到 fork 节点。\n" +
                "尝试连接：" + (hre.network.config?.url ?? "http://127.0.0.1:8545") + "\n" +
                "解决方案：\n" +
                "  1. 启动 fork 节点：npm run fork\n" +
                "  2. 等待节点完全启动\n" +
                "  3. 在另一个终端运行测试"
            );
        }

        // 其他 RPC 错误
        throw new Error(
            `ImportAddress：hardhat_impersonate 失败：${errorMsg}\n` +
            "账户：" + address + "\n" +
            "网络：" + (hre.network.name ?? "unknown") + "\n" +
            "RPC：" + (hre.network.config?.url ?? "unknown")
        );
    }

    // ─── 使用 hre.ethers 获取 signer ──────────────────────────────
    try {
        if (hre.ethers && typeof hre.ethers.getSigner === "function") {
            const signer = await hre.ethers.getSigner(address);
            return decorateEvmSigner(signer, {
                address,
                seedType: "privateKey",
                path: null,
                privateKey: "",
                source: "imported",
            });
        }
    } catch (getSignerError) {
        console.warn("[ImportAddress] hre.ethers.getSigner 失败，降级使用 JsonRpcSigner");
    }

    // ─── Fallback: 使用 JsonRpcSigner ─────────────────────────────
    try {
        const rpcUrl = hre.network.config?.url ?? process.env.RPC_URL ?? "http://127.0.0.1:8545";
        const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
        
        // 验证 provider 连接性
        try {
            await rpcProvider.getNetwork();
        } catch (networkError) {
            throw new Error(
                `JsonRpcSigner provider 连接失败：${networkError?.message}\n` +
                "RPC URL：" + rpcUrl
            );
        }

        return decorateEvmSigner(new ethers.JsonRpcSigner(rpcProvider, address), {
            address,
            seedType: "privateKey",
            path: null,
            privateKey: "",
            source: "imported",
        });
    } catch (fallbackError) {
        throw new Error(
            "ImportAddress：所有 signer 获取方式均失败\n" +
            "最后错误：" + (fallbackError?.message ?? String(fallbackError))
        );
    }
}

/**
 * 导入指定地址作为 signer（支持冒充和缓存）
 * @param {string} address - 要导入的地址
 * @returns {object} 装饰后的 signer 对象
 * @example
 * const signer = await importAddress("0x1234...");
 * await signer.sendTransaction(tx);
 */
async function ImportAddress(address) {
    const normalizedAddress = ethers.getAddress(String(address ?? "").trim());
    if (!importedSignerCache.has(normalizedAddress)) {
        importedSignerCache.set(normalizedAddress, await _ImportAddress(normalizedAddress));
    }
    return importedSignerCache.get(normalizedAddress);
}

/**
 * 从缓存中清除指定地址的 signer
 * @param {string} address - 要清除的地址
 */
function removeImportedSigner(address) {
    const normalizedAddress = ethers.getAddress(String(address ?? "").trim());
    return importedSignerCache.delete(normalizedAddress);
}

/**
 * 清空所有导入的 signer 缓存
 */
function clearImportedSignerCache() {
    importedSignerCache.clear();
}

/**
 * 获取所有已缓存的导入 signer 地址
 * @returns {string[]} 已缓存的地址列表
 */
function getCachedImportedSignerAddresses() {
    return Array.from(importedSignerCache.keys());
}

export {
    ImportAddress as importAddress,
    removeImportedSigner,
    clearImportedSignerCache,
    getCachedImportedSignerAddresses,
    decorateEvmSigner,
};

export default ImportAddress;
