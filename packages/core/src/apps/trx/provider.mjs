import { createHash } from "node:crypto";
import bs58 from "bs58";
import { HDNodeWallet, SigningKey, getBytes, keccak256, toUtf8Bytes } from "ethers";

function sha256(bytes) {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function hexToBytes(hex) {
  const normalized = String(hex ?? "").replace(/^0x/, "");
  if (!normalized) return new Uint8Array();
  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

function bytesToHex(bytes) {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function base58CheckEncode(payload) {
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return bs58.encode(Buffer.concat([Buffer.from(payload), checksum]));
}

function deriveTrxAddress(privateKeyHex) {
  const uncompressedPub = SigningKey.computePublicKey(privateKeyHex, false);
  const pubBytes = Buffer.from(hexToBytes(uncompressedPub));
  const noPrefixPub = pubBytes.subarray(1); // drop 0x04

  const hash = Buffer.from(hexToBytes(keccak256(noPrefixPub)));
  const addressBody = hash.subarray(hash.length - 20);
  const payload = Buffer.concat([Buffer.from([0x41]), addressBody]);

  return base58CheckEncode(payload);
}

const DEFAULT_TRX_PATH = "m/44'/195'/0'/0/0";

function normalizePrivateKeyHex(input) {
  const raw = String(input ?? "").trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("TRX 私钥必须是 32 字节 hex");
  }
  return `0x${raw.toLowerCase()}`;
}

function derivePrivateKeyFromSecret(secret, derivePath = DEFAULT_TRX_PATH) {
  if (!secret?.type) throw new Error("secret 无效");

  if (secret.type === "mnemonic") {
    const phrase = String(secret.value ?? "").trim();
    if (!phrase) throw new Error("mnemonic 不能为空");
    const node = HDNodeWallet.fromPhrase(phrase, undefined, derivePath);
    return normalizePrivateKeyHex(node.privateKey);
  }

  if (secret.type === "privateKey") {
    return normalizePrivateKeyHex(secret.value);
  }

  throw new Error(`TRX: 不支持的 secret type: ${secret.type}`);
}

function localSignTrxTransaction(tx, privateKeyHex) {
  const txid = String(tx?.txID ?? "").trim();
  if (!txid) throw new Error("signTransaction: 缺少 txID");

  const signingKey = new SigningKey(normalizePrivateKeyHex(privateKeyHex));
  const msgHash = getBytes(`0x${txid}`);
  const sig = signingKey.sign(msgHash);
  const recoveryId = (sig.v - 27).toString(16).padStart(2, "0");
  const signatureHex = `${sig.r.slice(2)}${sig.s.slice(2)}${recoveryId}`;

  return {
    ...tx,
    signature: [signatureHex],
  };
}

export function createTrxProvider(options = {}) {
  const version = String(options.version ?? "1.0.0");
  const addressTypes = ["default"];
  const operationList = ["getAddress", "signMessage", "signTransaction", "sendTransaction"];
  const operations = Array.from(new Set([...(options.operations ?? operationList)]));

  return {
    chain: "trx",
    version,
    operations,
    getAddressTypes() {
      return [...addressTypes];
    },
    supports(operation) {
      return operations.includes(String(operation ?? ""));
    },
    async createSigner(input = {}) {
      const walletContext = input.wallet;
      const keyId = String(input.keyId ?? "").trim();

      const hasWithSecret = typeof walletContext?.withUnlockedSecret === "function";
      const hasDerive = typeof walletContext?.deriveKeyMaterial === "function";
      if (!walletContext || (!hasWithSecret && !hasDerive)) {
        throw new Error("wallet context 无效：缺少 withUnlockedSecret/deriveKeyMaterial");
      }
      if (!keyId) {
        throw new Error("keyId 不能为空");
      }

      // ── getAddress 缓存 ──────────────────────────────────────────
      const addressCache = {}; // { "path": address }

      async function getPrimaryPrivateKey(operation, deriveOptions = {}, target = null) {
        const derivePath = String(deriveOptions.path ?? DEFAULT_TRX_PATH);

        if (hasWithSecret) {
          const material = await walletContext.withUnlockedSecret(
            { keyId, chain: "trx", operation, target },
            async (secret) => ({
              privateKeyHex: derivePrivateKeyFromSecret(secret, derivePath),
              path: derivePath,
            }),
          );
          return {
            privateKeyHex: material.privateKeyHex,
            material,
          };
        }

        const material = await walletContext.deriveKeyMaterial({ operation, target, ...deriveOptions });
        const privateKeyHex = normalizePrivateKeyHex(material?.privateKeyHex);
        return { privateKeyHex, material };
      }

      return {
        chain: "trx",
        keyId,
        providerVersion: version,
        capabilities: [...operations],
        async getAddress(getAddressOptions = {}) {
           if (hasWithSecret) {
            const rawPaths = Array.isArray(getAddressOptions.paths)
              ? getAddressOptions.paths
              : getAddressOptions.path
                ? [getAddressOptions.path]
                : [DEFAULT_TRX_PATH];
           
             // 优先检查缓存：如果所有 paths 都在缓存中，直接返回
             const allInCache = rawPaths.every((path) => path in addressCache);
             if (allInCache) {
               const cachedAddresses = rawPaths.map((path) => ({
                 path,
                 address: addressCache[path],
               }));
             
               await walletContext.audit?.({ at: new Date().toISOString(), keyId, chain: "trx", operation: "getAddress", status: "ok" });
             
               if (cachedAddresses.length === 1 && getAddressOptions.returnAll !== true) {
                 return cachedAddresses[0].address;
               }
               return { address: cachedAddresses[0]?.address, addresses: cachedAddresses };
             }
           
             // 缓存未命中：调用 executor 获取地址
             const addresses = await walletContext.withUnlockedSecret(
               { keyId, chain: "trx", operation: "getAddress", target: null },
               async (secret) => rawPaths.map((path) => {
                 // 再次检查缓存（防止并发）
                 if (path in addressCache) {
                   return { path, address: addressCache[path] };
                 }
               
                 // 计算地址
                 const privateKeyHex = derivePrivateKeyFromSecret(secret, path);
                 const address = deriveTrxAddress(privateKeyHex);
               
                 // 写入缓存
                 addressCache[path] = address;
               
                 return { path, address };
               }),
             );

            await walletContext.audit?.({ at: new Date().toISOString(), keyId, chain: "trx", operation: "getAddress", status: "ok" });

            if (addresses.length === 1 && getAddressOptions.returnAll !== true) {
              return addresses[0].address;
            }
            return { address: addresses[0]?.address, addresses };
          }

          const derivePath = String(getAddressOptions?.path ?? DEFAULT_TRX_PATH);
          
          // 检查缓存
          if (derivePath in addressCache) {
            await walletContext.audit?.({
              at: new Date().toISOString(),
              keyId,
              chain: "trx",
              operation: "getAddress",
              status: "ok",
            });
            return addressCache[derivePath];
          }
          
          const material = await walletContext.deriveKeyMaterial({ operation: "getAddress", ...getAddressOptions });
          const address = deriveTrxAddress(normalizePrivateKeyHex(material.privateKeyHex));
          
          // 写入缓存
          addressCache[derivePath] = address;

          await walletContext.audit?.({
            at: new Date().toISOString(),
            keyId,
            chain: "trx",
            operation: "getAddress",
            status: "ok",
          });

          return address;
        },
        async signMessage(payload, signOptions = {}) {
          const messageBytes = toUtf8Bytes(String(payload ?? ""));
          const digestHex = keccak256(messageBytes);

          const { privateKeyHex, material } = await getPrimaryPrivateKey(
            "signMessage",
            signOptions,
          );
          const signer = new SigningKey(privateKeyHex);
          const sig = signer.sign(digestHex);
          const signature = sig.serialized;

          await walletContext.audit?.({
            at: new Date().toISOString(),
            keyId,
            chain: "trx",
            operation: "signMessage",
            status: "ok",
          });

          return {
            ok: true,
            chain: "trx",
            keyId,
            operation: "signMessage",
            result: signature,
            meta: {
              digest: digestHex,
              algorithm: "keccak256+secp256k1",
              path: material?.path ?? null,
            },
          };
        },
        async signTransaction(transaction, signOptions = {}) {
          const { privateKeyHex, material } = await getPrimaryPrivateKey(
            "signTransaction",
            signOptions,
            { txID: transaction?.txID ?? null },
          );

          const signedTx = localSignTrxTransaction(transaction, privateKeyHex);
          await walletContext.audit?.({
            at: new Date().toISOString(),
            keyId,
            chain: "trx",
            operation: "signTransaction",
            status: "ok",
          });

          return {
            ok: true,
            chain: "trx",
            keyId,
            operation: "signTransaction",
            result: {
              txID: signedTx.txID,
              signedTx,
            },
            meta: {
              path: material?.path ?? null,
            },
          };
        },
        async sendTransaction(payload, sendOptions = {}) {
          const rpc = sendOptions.rpc ?? input.rpc;
          if (!rpc || typeof rpc.walletCall !== "function") {
            throw new Error("sendTransaction: 缺少可用 rpc（walletCall）");
          }

          const signed = await this.signTransaction(payload, sendOptions);
          const broadcast = await rpc.walletCall("broadcasttransaction", signed.result.signedTx);

          await walletContext.audit?.({
            at: new Date().toISOString(),
            keyId,
            chain: "trx",
            operation: "sendTransaction",
            status: "ok",
          });

          return {
            ok: true,
            chain: "trx",
            keyId,
            operation: "sendTransaction",
            result: {
              txID: signed.result.txID,
              broadcast,
            },
          };
        },
      };
    },
  };
}

export default createTrxProvider;
