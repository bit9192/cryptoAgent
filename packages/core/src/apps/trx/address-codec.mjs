import bs58 from "bs58";
import { createHash } from "node:crypto";
import { SigningKey, HDNodeWallet, getAddress, keccak256 } from "ethers";

function strip0x(value) {
  return String(value ?? "").replace(/^0x/i, "");
}

function ensureHexBytes(value) {
  const hex = strip0x(value);
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`非法 hex: ${value}`);
  }
  return Buffer.from(hex, "hex");
}

export function base58CheckEncode(payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const c1 = createHash("sha256").update(body).digest();
  const c2 = createHash("sha256").update(c1).digest();
  const checksum = c2.subarray(0, 4);
  return bs58.encode(Buffer.concat([body, checksum]));
}

export function base58CheckDecode(address) {
  const raw = Buffer.from(bs58.decode(String(address ?? "").trim()));
  if (raw.length < 5) throw new Error("Base58Check 数据过短");
  const body = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  const c1 = createHash("sha256").update(body).digest();
  const c2 = createHash("sha256").update(c1).digest();
  const expected = c2.subarray(0, 4);
  if (!checksum.equals(expected)) throw new Error("Base58Check 校验失败");
  return body;
}

export function toTrxHexAddress(address) {
  const raw = String(address ?? "").trim();
  if (!raw) throw new Error("地址不能为空");

  if (/^41[0-9a-fA-F]{40}$/.test(raw)) return raw.toUpperCase();
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) return `41${raw.slice(2)}`.toUpperCase();
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw)) {
    const payload = base58CheckDecode(raw);
    if (payload.length !== 21 || payload[0] !== 0x41) {
      throw new Error(`非法 TRX Base58 地址: ${raw}`);
    }
    return payload.toString("hex").toUpperCase();
  }
  throw new Error(`不支持的 TRX 地址格式: ${raw}`);
}

export function toTrxBase58Address(address) {
  const hex = toTrxHexAddress(address);
  return base58CheckEncode(Buffer.from(hex, "hex"));
}

function normalizePrivateKeyHex(privateKey) {
  const raw = String(privateKey ?? "").trim();
  const hex = strip0x(raw);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("TRX 私钥必须是 32 字节 hex");
  }
  return `0x${hex.toLowerCase()}`;
}

export function deriveTrxAddressFromPrivateKey(privateKey) {
  const key = new SigningKey(normalizePrivateKeyHex(privateKey));
  const pub = Buffer.from(key.publicKey.slice(4), "hex");
  const hash = Buffer.from(keccak256(pub).slice(2), "hex");
  const payload = Buffer.concat([Buffer.from([0x41]), hash.subarray(-20)]);
  return base58CheckEncode(payload);
}

export function deriveTrxPrivateKeyFromMnemonic(mnemonic, path = "m/44'/195'/0'/0/0") {
  const node = HDNodeWallet.fromPhrase(String(mnemonic ?? "").trim(), undefined, path);
  return normalizePrivateKeyHex(node.privateKey);
}

export function toEthHexAddress(address) {
  const hex = toTrxHexAddress(address);
  return getAddress(`0x${hex.slice(2).toLowerCase()}`);
}
