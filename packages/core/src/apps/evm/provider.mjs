import { Wallet, JsonRpcProvider } from "ethers";
import { resolveEvmNetProvider } from "./netprovider.mjs";

function resolveProvider(inputRpc, signerOptions = {}) {
  if (!inputRpc) {
    const providerInput = signerOptions.netProvider ?? signerOptions.networkNameOrProvider ?? signerOptions.networkName ?? signerOptions.network;
    if (!providerInput) {
      return null;
    }
    const resolved = resolveEvmNetProvider(providerInput, signerOptions);
    return resolved?.provider ?? null;
  }
  if (typeof inputRpc === "string") {
    return new JsonRpcProvider(inputRpc);
  }
  if (typeof inputRpc === "object") {
    if (typeof inputRpc.getBlockNumber === "function" || typeof inputRpc.request === "function") {
      return inputRpc;
    }
    if (inputRpc.provider) {
      return inputRpc.provider;
    }
  }
  return inputRpc;
}

function unwrapAdapterResult(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (value.ok === true && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

export function wrapEvmSignerAsEthersSigner(input = {}) {
  const signer = input?.signer;
  const provider = resolveProvider(input?.provider ?? input?.rpc ?? input?.rpcUrl, input?.options ?? {});
  if (!signer || typeof signer !== "object") {
    throw new Error("signer 不能为空");
  }

  return new Proxy(signer, {
    get(target, prop, receiver) {
      if (prop === "provider") {
        return provider ?? target.provider ?? null;
      }

      if (Reflect.has(target, prop)) {
        const own = Reflect.get(target, prop, receiver);
        if (typeof own !== "function") {
          return own;
        }
        return async (...args) => unwrapAdapterResult(await own.apply(target, args));
      }

      if (provider && Reflect.has(provider, prop)) {
        const delegated = Reflect.get(provider, prop, provider);
        return typeof delegated === "function" ? delegated.bind(provider) : delegated;
      }

      return undefined;
    },
  });
}

export function createEvmProvider(options = {}) {
  const version = String(options.version ?? "1.0.0");
  const operationList = [
    "getAddress",
    "signMessage",
    "signTransaction",
    "sendTransaction",
  ];
  const operations = Array.from(new Set([...(options.operations ?? operationList)]));

  return {
    chain: "evm",
    version,
    operations,
    supports(operation) {
      return operations.includes(String(operation ?? ""));
    },
    async createSigner(input = {}) {
      const walletContext = input.wallet;
      const keyId = String(input.keyId ?? "").trim();
      const rpcProvider = resolveProvider(input.rpc, input.options ?? {});

      if (!walletContext || typeof walletContext.deriveKeyMaterial !== "function") {
        throw new Error("wallet context 无效：缺少 deriveKeyMaterial");
      }
      if (!keyId) {
        throw new Error("keyId 不能为空");
      }

      async function getPrimaryWallet(operation, deriveOptions = {}, target) {
        const material = await walletContext.deriveKeyMaterial({
          operation,
          target,
          ...deriveOptions,
        });
        const privateKeyHex = material?.privateKeyHex;
        if (!privateKeyHex) {
          throw new Error("未获取到可用私钥");
        }
        return {
          wallet: new Wallet(privateKeyHex),
          material,
        };
      }

      // ── getAddress 缓存 ──────────────────────────────────────────
      const addressCache = {}; // { "path": address }

      return {
        chain: "evm",
        keyId,
        providerVersion: version,
        capabilities: [...operations],
        async getAddress(getAddressOptions = {}) {
          const rawPaths = Array.isArray(getAddressOptions.paths)
            ? getAddressOptions.paths
            : getAddressOptions.path
              ? [getAddressOptions.path]
              : null;

          // 优先检查缓存：仅在调用方显式提供 path(s) 时生效
          if (rawPaths && rawPaths.length > 0) {
            const allInCache = rawPaths.every((p) => p in addressCache);
            if (allInCache) {
              const addresses = rawPaths.map((p) => ({ path: p, address: addressCache[p] }));

              await walletContext.audit?.({
                at: new Date().toISOString(),
                keyId,
                chain: "evm",
                operation: "getAddress",
                status: "ok",
              });

              if (addresses.length === 1 && getAddressOptions.returnAll !== true) {
                return addresses[0].address;
              }
              return {
                address: addresses[0]?.address,
                addresses,
              };
            }
          }

          const material = await walletContext.deriveKeyMaterial({
            operation: "getAddress",
            ...getAddressOptions,
          });

          const items = Array.isArray(material?.items) ? material.items : [];
          if (items.length > 1 || getAddressOptions.returnAll === true) {
            const addresses = items.map((item) => {
              // 检查缓存
              if (item.path in addressCache) {
                return { path: item.path, address: addressCache[item.path] };
              }
              
              // 计算地址
              const address = new Wallet(item.privateKeyHex).address;
              
              // 写入缓存
              addressCache[item.path] = address;
              
              return { path: item.path, address };
            });
            return {
              address: addresses[0]?.address,
              addresses,
            };
          }

          const derivePath = String(material?.path ?? material?.items?.[0]?.path ?? "m/44'/60'/0'/0/0");
          
          // 检查缓存
          if (derivePath in addressCache) {
            await walletContext.audit?.({
              at: new Date().toISOString(),
              keyId,
              chain: "evm",
              operation: "getAddress",
              status: "ok",
            });
            return addressCache[derivePath];
          }
          
          const address = new Wallet(material.privateKeyHex).address;
          
          // 写入缓存
          addressCache[derivePath] = address;
          
          await walletContext.audit?.({
            at: new Date().toISOString(),
            keyId,
            chain: "evm",
            operation: "getAddress",
            status: "ok",
          });
          return address;
        },
        async signMessage(payload, signOptions = {}) {
          const message = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
          const { wallet: evmWallet, material } = await getPrimaryWallet(
            "signMessage",
            signOptions,
          );
          const signature = await evmWallet.signMessage(message);
          await walletContext.audit?.({
            at: new Date().toISOString(),
            keyId,
            chain: "evm",
            operation: "signMessage",
            status: "ok",
          });
          return {
            ok: true,
            chain: "evm",
            keyId,
            operation: "signMessage",
            result: signature,
            meta: {
              path: material?.path ?? null,
            },
          };
        },
        async signTransaction(payload, signOptions = {}) {
          if (!payload || typeof payload !== "object") {
            throw new Error("payload 不能为空");
          }

          const { wallet: evmWallet, material } = await getPrimaryWallet(
            "signTransaction",
            signOptions,
            {
              address: payload.to,
              amount: payload.value,
            },
          );
          const signedTx = await evmWallet.signTransaction(payload);

          await walletContext.audit?.({
            at: new Date().toISOString(),
            keyId,
            chain: "evm",
            operation: "signTransaction",
            status: "ok",
            target: {
              address: payload.to,
            },
          });

          return {
            ok: true,
            chain: "evm",
            keyId,
            operation: "signTransaction",
            result: signedTx,
            meta: {
              path: material?.path ?? null,
            },
          };
        },
        async sendTransaction(payload, sendOptions = {}) {
          if (!rpcProvider) {
            throw new Error("sendTransaction 需要 rpc provider");
          }
          if (!payload || typeof payload !== "object") {
            throw new Error("payload 不能为空");
          }

          const { wallet: evmWallet, material } = await getPrimaryWallet(
            "sendTransaction",
            sendOptions,
            {
              address: payload.to,
              amount: payload.value,
            },
          );
          const connected = evmWallet.connect(rpcProvider);
          const tx = await connected.sendTransaction(payload);

          await walletContext.audit?.({
            at: new Date().toISOString(),
            keyId,
            chain: "evm",
            operation: "sendTransaction",
            status: "ok",
            target: {
              address: payload.to,
            },
          });

          return {
            ok: true,
            chain: "evm",
            keyId,
            operation: "sendTransaction",
            result: tx,
            meta: {
              path: material?.path ?? null,
            },
          };
        },
      };
    },
  };
}

export default createEvmProvider;
