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

      return {
        chain: "evm",
        keyId,
        providerVersion: version,
        capabilities: [...operations],
        async getAddress(getAddressOptions = {}) {
          const material = await walletContext.deriveKeyMaterial({
            operation: "getAddress",
            ...getAddressOptions,
          });

          const items = Array.isArray(material?.items) ? material.items : [];
          if (items.length > 1 || getAddressOptions.returnAll === true) {
            const addresses = items.map((item) => ({
              path: item.path,
              address: new Wallet(item.privateKeyHex).address,
            }));
            return {
              address: addresses[0]?.address,
              addresses,
            };
          }

          const address = new Wallet(material.privateKeyHex).address;
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
