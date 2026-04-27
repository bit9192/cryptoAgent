import { createHash } from "node:crypto";
import bs58 from "bs58";

export function normalizeStringList(input) {
  if (input == null) {
    return [];
  }

  if (Array.isArray(input)) {
    return input
      .flatMap((item) => normalizeStringList(item))
      .filter(Boolean);
  }

  const value = String(input).trim();
  return value ? [value] : [];
}

export function normalizeTags(tags) {
  return Array.from(new Set(normalizeStringList(tags)));
}

export function normalizeScope(scope = {}) {
  if (!scope || typeof scope !== "object") {
    return {};
  }

  const normalized = {};
  if (scope.chain) normalized.chain = String(scope.chain);
  if (scope.address) normalized.address = String(scope.address);

  const contracts = normalizeStringList(scope.contracts);
  if (contracts.length > 0) normalized.contracts = contracts;

  const selectors = normalizeStringList(scope.selectors);
  if (selectors.length > 0) normalized.selectors = selectors;

  return normalized;
}

export function buildKeyId(entry, options = {}) {
  const source = String(options.source ?? "generic").trim().toLowerCase() || "generic";
  const sourceRef = String(options.sourceRef ?? "").trim();
  const entryIndex = Number.isInteger(options.entryIndex) && options.entryIndex >= 0
    ? options.entryIndex
    : -1;
  const name = String(entry?.name ?? "").trim();
  return createHash("sha256")
    .update(`${source}:${sourceRef}:${entryIndex}:${entry.type}:${entry.secret}:${name}`)
    .digest("hex")
    .slice(0, 24);
}

export function normalizeHexPrivateKey(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new Error("privateKey 不能为空");
  }
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("privateKey 格式无效（需 64 位 hex）");
  }
  return normalized;
}

function base58CheckDecode(text) {
  const raw = Buffer.from(bs58.decode(String(text ?? "").trim()));
  if (raw.length < 5) {
    throw new Error("WIF/Base58Check 长度无效");
  }

  const payload = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  const expected = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest()
    .subarray(0, 4);

  if (!checksum.equals(expected)) {
    throw new Error("WIF/Base58Check 校验失败");
  }

  return payload;
}

export function normalizeSecp256k1PrivateKey(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new Error("privateKey 不能为空");
  }

  if (/^[5KLc9][1-9A-HJ-NP-Za-km-z]{50,53}$/.test(value)) {
    const payload = base58CheckDecode(value);
    if (payload.length !== 33 && payload.length !== 34) {
      throw new Error("WIF payload 长度无效");
    }

    const keyBytes = payload.length === 34 ? payload.subarray(1, 33) : payload.subarray(1);
    return `0x${Buffer.from(keyBytes).toString("hex")}`;
  }

  return normalizeHexPrivateKey(value);
}

export function normalizeBtcAddressType(input) {
  const raw = String(input ?? "p2pkh").trim().toLowerCase();
  if (raw === "legacy" || raw === "p2pkh") return "p2pkh";
  if (raw === "nested" || raw === "p2sh-p2wpkh" || raw === "p2sh") return "p2sh-p2wpkh";
  if (raw === "segwit" || raw === "p2wpkh" || raw === "bech32") return "p2wpkh";
  return "p2pkh";
}

export function defaultDerivationPathByChain(input = {}) {
  const chain = String(input.chain ?? "").trim().toLowerCase();
  const network = String(input.network ?? "mainnet").toLowerCase();

  if (chain === "btc") {
    const coinType = network === "testnet" ? 1 : 0;
    const addressType = normalizeBtcAddressType(input.addressType);
    if (addressType === "p2wpkh") return `m/84'/${coinType}'/0'/0/0`;
    if (addressType === "p2sh-p2wpkh") return `m/49'/${coinType}'/0'/0/0`;
    return `m/44'/${coinType}'/0'/0/0`;
  }

  if (chain === "trx") {
    return "m/44'/195'/0'/0/0";
  }

  return "m/44'/60'/0'/0/0";
}

export function normalizePathList(pathInput, pathsInput, fallbackPath) {
  const out = [];
  if (Array.isArray(pathsInput)) {
    for (const item of pathsInput) {
      const value = String(item ?? "").trim();
      if (value) out.push(value);
    }
  }
  const single = String(pathInput ?? "").trim();
  if (single) out.push(single);

  const deduped = Array.from(new Set(out));
  if (deduped.length > 0) return deduped;
  return [fallbackPath];
}

export function normalizeChainRequests(chainsInput) {
  if (!Array.isArray(chainsInput) || chainsInput.length === 0) {
    return [];
  }

  const normalized = [];
  for (const item of chainsInput) {
    if (typeof item === "string") {
      const chain = String(item).trim().toLowerCase();
      if (chain) normalized.push({ chain, addressTypes: null });
      continue;
    }

    if (item && typeof item === "object") {
      const chain = String(item.chain ?? "").trim().toLowerCase();
      if (!chain) continue;
      const addressTypes = Array.isArray(item.addressTypes)
        ? Array.from(new Set(item.addressTypes.map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean)))
        : null;
      normalized.push({ chain, addressTypes: addressTypes?.length ? addressTypes : null });
    }
  }

  return normalized;
}
