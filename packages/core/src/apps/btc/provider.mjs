/**
 * BTC Wallet Provider（B 方案）
 *
 * 安全边界：私钥 **不离开** withUnlockedSecret 执行器闭包。
 * 所有地址类型（p2pkh / p2sh-p2wpkh / p2wpkh / p2tr）均在闭包内完成推导与签名。
 */
import { createHash as nodeCreateHash } from "node:crypto";
import bs58 from "bs58";
import { HDNodeWallet } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";

// ── 初始化 bitcoinjs-lib 椭圆曲线 ──────────────────────────────────────────────
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// ── 网络映射 ───────────────────────────────────────────────────────────────────
function resolveBtcJsNetwork(networkName) {
  const n = String(networkName ?? "mainnet").toLowerCase();
  if (n === "testnet" || n === "signet") return bitcoin.networks.testnet;
  if (n === "regtest") return bitcoin.networks.regtest;
  return bitcoin.networks.bitcoin; // mainnet
}

// ── 地址类型归一化 ─────────────────────────────────────────────────────────────
function normalizeAddressType(input) {
  const raw = String(input ?? "p2wpkh").trim().toLowerCase();
  if (raw === "legacy" || raw === "p2pkh") return "p2pkh";
  if (raw === "nested" || raw === "p2sh-p2wpkh" || raw === "p2sh") return "p2sh-p2wpkh";
  if (raw === "p2wsh" || raw === "p2wsh-multisig" || raw === "multisig") return "p2wsh";
  if (raw === "segwit" || raw === "p2wpkh" || raw === "bech32") return "p2wpkh";
  if (raw === "taproot" || raw === "p2tr") return "p2tr";
  throw new Error(`BTC: 不支持的 addressType: ${raw}`);
}

// ── 默认 BIP32 推导路径（参照 test.key.md 规范）────────────────────────────────
function defaultDerivationPath(addressType, networkName) {
  const coinType = (networkName === "testnet" || networkName === "regtest" || networkName === "signet") ? 1 : 0;
  switch (addressType) {
    case "p2pkh":       return `m/44'/${coinType}'/0'/0/0`;
    case "p2sh-p2wpkh": return `m/49'/${coinType}'/0'/0/0`;
    case "p2wpkh":      return `m/84'/${coinType}'/0'/0/0`;
    case "p2tr":        return `m/86'/${coinType}'/0'/0/0`;
    default:            return `m/44'/${coinType}'/0'/0/0`;
  }
}

// ── 私钥推导（仅在 withUnlockedSecret 执行器内调用）────────────────────────────
function decodeWifPrivKey(wif) {
  const decoded = Buffer.from(bs58.decode(String(wif).trim()));
  if (decoded.length < 33) throw new Error("WIF 格式无效：payload 过短");
  const withoutChecksum = decoded.slice(0, decoded.length - 4);
  const checksum = decoded.slice(decoded.length - 4);
  const expected = nodeCreateHash("sha256")
    .update(nodeCreateHash("sha256").update(withoutChecksum).digest())
    .digest()
    .slice(0, 4);
  if (!checksum.equals(expected)) throw new Error("WIF 校验失败");
  // payload: [version][32 key bytes][optional 0x01 compression flag]
  const keyBytes = withoutChecksum.length === 34
    ? withoutChecksum.slice(1, 33)
    : withoutChecksum.slice(1);
  return Buffer.from(keyBytes);
}

function derivePrivKeyBuffer(secret, derivePath) {
  if (!secret?.type) throw new Error("secret 无效");

  if (secret.type === "mnemonic") {
    const phrase = String(secret.value ?? "").trim();
    if (!phrase) throw new Error("mnemonic 不能为空");
    const node = HDNodeWallet.fromPhrase(phrase, undefined, derivePath);
    const hex = String(node.privateKey).replace(/^0x/i, "");
    return Buffer.from(hex, "hex");
  }

  if (secret.type === "privateKey") {
    const raw = String(secret.value ?? "").trim();
    if (!raw) throw new Error("privateKey 不能为空");
    // WIF 格式
    if (/^[5KLc][1-9A-HJ-NP-Za-km-z]{50,52}$/.test(raw)) {
      return decodeWifPrivKey(raw);
    }
    return Buffer.from(raw.replace(/^0x/i, ""), "hex");
  }

  throw new Error(`BTC: 不支持的 secret type: ${secret.type}`);
}

// ── 地址推导（从私钥 Buffer）──────────────────────────────────────────────────
function btcAddressFromPrivKey(privKeyBuffer, addressType, btcJsNet) {
  const keyPair = ECPair.fromPrivateKey(privKeyBuffer, { network: btcJsNet });
  const pubKey = keyPair.publicKey;

  switch (addressType) {
    case "p2pkh":
      return bitcoin.payments.p2pkh({ pubkey: pubKey, network: btcJsNet }).address;
    case "p2wpkh":
      return bitcoin.payments.p2wpkh({ pubkey: pubKey, network: btcJsNet }).address;
    case "p2sh-p2wpkh": {
      const inner = bitcoin.payments.p2wpkh({ pubkey: pubKey, network: btcJsNet });
      return bitcoin.payments.p2sh({ redeem: inner, network: btcJsNet }).address;
    }
    case "p2tr": {
      const xOnly = pubKey.slice(1); // 去掉 33-byte 前缀，保留 32-byte x-only
      return bitcoin.payments.p2tr({ internalPubkey: xOnly, network: btcJsNet }).address;
    }
    default:
      throw new Error(`BTC: 不支持的 addressType: ${addressType}`);
  }
}

// 公钥推导（安全可外部返回）
function btcPublicKeyFromPrivKey(privKeyBuffer, btcJsNet) {
  const keyPair = ECPair.fromPrivateKey(privKeyBuffer, { network: btcJsNet });
  return keyPair.publicKey; // 33-byte compressed
}

// ── PSBT 单输入签名 ────────────────────────────────────────────────────────────
function signPsbtInput(psbt, inputIndex, privKeyBuffer, addressType, btcJsNet) {
  if (addressType === "p2tr") {
    // Taproot Schnorr：需要使用 tweaked 私钥
    const keyPair = ECPair.fromPrivateKey(privKeyBuffer, { network: btcJsNet });
    const xOnlyPubKey = keyPair.publicKey.slice(1);
    const tweakHash = bitcoin.crypto.taggedHash("TapTweak", xOnlyPubKey);
    const tweakedKeyPair = keyPair.tweak(tweakHash);
    psbt.signInput(inputIndex, tweakedKeyPair);
  } else {
    // ECDSA（p2pkh / p2wpkh / p2sh-p2wpkh）
    const keyPair = ECPair.fromPrivateKey(privKeyBuffer, { network: btcJsNet });
    psbt.signInput(inputIndex, keyPair);
  }
}

// ── Bitcoin 消息签名前缀哈希 ───────────────────────────────────────────────────
function btcMessageHash(message) {
  const msgBuf = Buffer.from(String(message ?? ""), "utf8");
  const prefix = Buffer.from("Bitcoin Signed Message:\n", "utf8");
  const varint = (n) => {
    if (n < 253) return Buffer.from([n]);
    const b = Buffer.alloc(3); b[0] = 253; b.writeUInt16LE(n, 1); return b;
  };
  const pre = Buffer.concat([varint(prefix.length), prefix, varint(msgBuf.length), msgBuf]);
  return nodeCreateHash("sha256")
    .update(nodeCreateHash("sha256").update(pre).digest())
    .digest();
}

function normalizePsbtPayload(payload) {
  if (payload?.psbtBase64) {
    return {
      psbtBase64: String(payload.psbtBase64),
      encoding: "base64",
    };
  }
  if (payload?.psbtHex) {
    return {
      psbtBase64: Buffer.from(String(payload.psbtHex), "hex").toString("base64"),
      encoding: "hex",
    };
  }
  throw new Error("signPsbt: 缺少 psbtBase64 或 psbtHex");
}

function psbtBase64ToHex(psbtBase64) {
  return Buffer.from(String(psbtBase64 ?? ""), "base64").toString("hex");
}

// ── Provider 工厂 ──────────────────────────────────────────────────────────────
export function createBtcProvider(options = {}) {
  const version = String(options.version ?? "1.0.0");
  const operations = Array.from(new Set([
    "getAddress",
    "getPublicKey",
    "signMessage",
    "signPsbt",
    "signTransaction",   // signPsbt 的统一接口别名
    "sendTransaction",
    ...(Array.isArray(options.operations) ? options.operations : []),
  ]));

  return {
    chain: "btc",
    version,
    operations,
    supports(operation) {
      return operations.includes(String(operation ?? ""));
    },

    async createSigner(input = {}) {
      const walletCtx = input.wallet;
      const keyId = String(input.keyId ?? "").trim();
      const networkName = String(
        input.options?.network ?? options.network ?? "mainnet",
      ).toLowerCase();
      const btcJsNet = resolveBtcJsNetwork(networkName);

      if (!walletCtx?.withUnlockedSecret) {
        throw new Error("BTC provider: wallet context 无效，缺少 withUnlockedSecret");
      }
      if (!keyId) throw new Error("keyId 不能为空");

      // 封装：带 keyId/chain 的 withUnlockedSecret 调用
      const withSecret = (operation, target, executor) =>
        walletCtx.withUnlockedSecret({ keyId, chain: "btc", operation, target }, executor);

      const auditOk = (operation, target) =>
        walletCtx.audit?.({
          at: new Date().toISOString(),
          keyId,
          chain: "btc",
          operation,
          status: "ok",
          target,
        });

      return {
        chain: "btc",
        keyId,
        providerVersion: version,
        capabilities: [...operations],

        // ── getAddress ──────────────────────────────────────────────────────
        async getAddress(opts = {}) {
          const addressType = normalizeAddressType(
            opts.addressType ?? input.options?.addressType ?? options.addressType ?? "p2wpkh",
          );
          const rawPaths = Array.isArray(opts.paths) ? opts.paths
            : opts.path ? [opts.path]
            : null;

          const items = await withSecret("getAddress", null, (secret) => {
            const paths = rawPaths ?? [defaultDerivationPath(addressType, networkName)];
            return paths.map((p) => ({
              path: p,
              address: btcAddressFromPrivKey(
                derivePrivKeyBuffer(secret, p), addressType, btcJsNet,
              ),
            }));
          });

          await auditOk("getAddress");

          if (items.length === 1 && !opts.returnAll) return items[0].address;
          return { address: items[0]?.address, addresses: items, addressType, network: networkName };
        },

        // ── getPublicKey（公钥可安全对外返回）──────────────────────────────
        async getPublicKey(opts = {}) {
          const addressType = normalizeAddressType(
            opts.addressType ?? input.options?.addressType ?? options.addressType ?? "p2wpkh",
          );
          const derivePath = opts.path ?? defaultDerivationPath(addressType, networkName);

          const publicKey = await withSecret("getAddress", null, (secret) => {
            const buf = btcPublicKeyFromPrivKey(
              derivePrivKeyBuffer(secret, derivePath), btcJsNet,
            );
            return buf; // 33-byte compressed，内容非敏感
          });

          return {
            ok: true,
            publicKey,          // Buffer 33-byte compressed pubkey
            xOnlyPubKey: publicKey.slice(1), // 32-byte x-only，用于 p2tr
            path: derivePath,
            addressType,
          };
        },

        // ── signMessage ─────────────────────────────────────────────────────
        async signMessage(payload, opts = {}) {
          const message = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
          const addressType = normalizeAddressType(opts.addressType ?? "p2pkh");
          const derivePath = opts.path ?? defaultDerivationPath(addressType, networkName);

          const signature = await withSecret("signMessage", null, (secret) => {
            const privKeyBuffer = derivePrivKeyBuffer(secret, derivePath);
            const keyPair = ECPair.fromPrivateKey(privKeyBuffer, { network: btcJsNet });
            const msgHash = btcMessageHash(message);
            return Buffer.from(keyPair.sign(msgHash)).toString("hex");
          });

          await auditOk("signMessage");

          return {
            ok: true,
            chain: "btc",
            keyId,
            operation: "signMessage",
            result: signature,
            meta: { derivePath },
          };
        },

        // ── signPsbt（核心：支持多输入 + 路径去重 + 全 4 种地址类型）──────
        // payload: {
        //   psbtBase64: string,
        //   signingRequests: [{ inputIndex, derivePath, addressType }],
        //   target?: { to, amount }   ← 用于 capability 审计
        // }
        async signPsbt(payload, opts = {}) {
          const { psbtBase64, encoding } = normalizePsbtPayload(payload);
          const requests = Array.isArray(payload.signingRequests)
            ? payload.signingRequests : [];
          if (requests.length === 0) throw new Error("signPsbt: signingRequests 不能为空");

          const target = payload.target ?? null;
          const shouldFinalize = payload?.finalize ?? opts?.finalize ?? true;

          const txResult = await withSecret("signPsbt", target, (secret) => {
            // 路径去重：每个唯一路径只派生一次私钥
            const keyCache = new Map();
            const getKey = (path) => {
              if (!keyCache.has(path)) {
                keyCache.set(path, derivePrivKeyBuffer(secret, path));
              }
              return keyCache.get(path);
            };

            const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcJsNet });

            for (const req of requests) {
              const addrType = normalizeAddressType(req.addressType ?? "p2wpkh");
              signPsbtInput(psbt, req.inputIndex, getKey(req.derivePath), addrType, btcJsNet);
            }

            if (!shouldFinalize) {
              const signedPsbtBase64 = psbt.toBase64();
              keyCache.clear();
              return {
                psbtBase64: signedPsbtBase64,
                psbtHex: psbtBase64ToHex(signedPsbtBase64),
                encoding,
                finalized: false,
              };
            }

            psbt.finalizeAllInputs();
            const tx = psbt.extractTransaction();
            keyCache.clear(); // 主动清理

            return {
              txHex: tx.toHex(),
              txid: tx.getId(),
              finalized: true,
            };
          });

          await auditOk("signPsbt", target);

          const uniquePaths = [...new Set(requests.map((r) => r.derivePath))].length;
          return {
            ok: true,
            chain: "btc",
            keyId,
            operation: "signPsbt",
            result: txResult,
            meta: {
              inputCount: requests.length,
              uniquePaths,
              finalized: Boolean(txResult?.finalized),
            },
          };
        },

        // ── signTransaction（统一接口别名，与 EVM/TRX signer 名称对齐）─────
        async signTransaction(payload, opts = {}) {
          return this.signPsbt(payload, opts);
        },

        // ── sendTransaction（签名 + 广播，需传入 netProvider）──────────────
        // payload: 同 signPsbt；opts.rpc 需为 resolveBtcProvider 返回的 provider
        async sendTransaction(payload, opts = {}) {
          const signResult = await this.signPsbt(payload, opts);
          if (!signResult.ok) throw new Error("signPsbt 失败");

          const rpc = opts.rpc ?? input.rpc;
          if (!rpc?.adapter?.sendTx) {
            throw new Error("sendTransaction: 缺少 rpc netProvider（含 adapter.sendTx）");
          }

          const txid = await rpc.adapter.sendTx(signResult.result.txHex);
          await auditOk("sendTransaction", payload?.target ?? null);

          return {
            ok: true,
            chain: "btc",
            keyId,
            operation: "sendTransaction",
            result: { txid, txHex: signResult.result.txHex },
          };
        },
      };
    },
  };
}

export default createBtcProvider;
