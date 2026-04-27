import { defaultDerivationPathByChain } from "./utils.mjs";

export function parseAddressConfigsFromText(rawText) {
  const rawLines = String(rawText ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  function stripNoise(line) {
    return line.replace(/^(>\s*)+/, "").trim();
  }

  function looksLikeSecret(s) {
    if (/^(0x)?[a-fA-F0-9]{64}$/.test(s)) return true;
    if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s)) return true;
    const words = s.split(/\s+/).filter((w) => /^[a-zA-Z]+$/.test(w));
    return words.length >= 12 && words.length <= 24;
  }

  const lines = rawLines.map((raw, idx) => ({ idx, trimmed: raw.trim() }));

  const secretIndices = lines
    .filter((l) => {
      const s = stripNoise(l.trimmed);
      return s && !l.trimmed.startsWith("#") && l.trimmed !== "" && looksLikeSecret(s);
    })
    .map((l) => l.idx);

  const result = new Map();

  for (let si = 0; si < secretIndices.length; si++) {
    const secretIdx = secretIndices[si];
    const nextSecretIdx = secretIndices[si + 1] ?? lines.length;

    let name = null;
    for (let i = secretIdx - 1; i >= 0; i--) {
      const t = lines[i].trimmed;
      if (t === "" || t.startsWith("#")) continue;
      const s = stripNoise(t);
      if (looksLikeSecret(s)) break;
      name = t;
      break;
    }

    const directives = [];
    for (let i = secretIdx + 1; i < nextSecretIdx; i++) {
      const t = lines[i].trimmed;
      if (t.startsWith("@address-config")) {
        directives.push(t);
      }
    }

    if (name && directives.length > 0) {
      result.set(name, directives);
    }
  }

  return result;
}

export function parseDirectiveParams(line) {
  const body = line.replace(/^@address-config\s*/, "").trim();
  const params = {};
  const regex = /(\w[\w-]*)=([\S]*)/g;
  let m;
  while ((m = regex.exec(body)) !== null) {
    params[m[1]] = m[2];
  }
  return params;
}

export function expandDirective(params) {
  const rawChains = String(params.chain ?? "btc").split(",").map((s) => s.trim()).filter(Boolean);
  const rawTypes = params.type ? String(params.type).split(",").map((s) => s.trim()).filter(Boolean) : [null];
  const pathPattern = String(params.path ?? "").trim() || null;
  const nameTemplate = String(params.name ?? "").trim() || null;

  const expanded = [];
  for (const chain of rawChains) {
    for (const rawType of rawTypes) {
      let addressType = null;
      if (chain === "btc" && rawType) {
        const t = String(rawType).trim().toLowerCase();
        if (t === "p2wpkh" || t === "segwit" || t === "bech32") addressType = "p2wpkh";
        else if (t === "p2sh-p2wpkh" || t === "p2sh" || t === "nested") addressType = "p2sh-p2wpkh";
        else if (t === "p2tr" || t === "taproot") addressType = "p2tr";
        else if (t === "p2pkh" || t === "legacy") addressType = "p2pkh";
        else addressType = t;
      } else if (chain === "btc") {
        addressType = "p2wpkh";
      } else {
        addressType = null;
      }

      let name = nameTemplate;
      if (name) {
        name = name.replace(/\{type\}/g, addressType ?? "").replace(/\{chain\}/g, chain);
      }

      expanded.push({ chain, addressType, pathPattern, name });
    }
  }
  return expanded;
}

export function resolveWildcardPath(pathPattern, chain, addressType, network) {
  if (!pathPattern) return null;
  if (pathPattern === "*") {
    return defaultDerivationPathByChain({ chain, addressType, network });
  }
  const isTestnet = String(network ?? "mainnet").toLowerCase() !== "mainnet";
  const coinType = isTestnet ? "1" : "0";

  let purposePrime;
  if (chain === "btc") {
    if (addressType === "p2wpkh") purposePrime = "84";
    else if (addressType === "p2sh-p2wpkh") purposePrime = "49";
    else if (addressType === "p2tr") purposePrime = "86";
    else purposePrime = "44";
  } else if (chain === "trx") {
    purposePrime = "44";
  } else {
    purposePrime = "44";
  }

  const segments = pathPattern.split("/");
  const resolved = segments.map((seg, i) => {
    if (seg === "*'") {
      if (chain === "evm" || chain === "trx") {
        if (i === 1) return `${purposePrime}'`;
        if (i === 2) return chain === "evm" ? "60'" : "195'";
        if (i === 3) return "0'";
      } else {
        if (i === 1) return `${purposePrime}'`;
        if (i === 2) return `${coinType}'`;
        if (i === 3) return "0'";
      }
    }
    if (seg === "*") {
      if (i === 4) return "0";
    }
    return seg;
  });
  return resolved.join("/");
}

export function expandPathRange(resolvedPath, baseName) {
  const rangeMatch = resolvedPath.match(/^(.*)\[(\d+),(\d+)\](.*)$/);
  if (!rangeMatch) {
    return [{ path: resolvedPath, name: baseName }];
  }

  const prefix = rangeMatch[1];
  const start = parseInt(rangeMatch[2], 10);
  const end = parseInt(rangeMatch[3], 10);
  const suffix = rangeMatch[4];

  if (start > end) return [];

  const items = [];
  for (let i = start; i <= end; i++) {
    items.push({
      path: `${prefix}${i}${suffix}`,
      name: baseName ? `${baseName}-${i}` : null,
    });
  }
  return items;
}

export function validateBtcPurposeMatch(addressType, resolvedPath) {
  if (!resolvedPath) return null;
  const m = resolvedPath.match(/^m\/(\d+)'/);
  if (!m) return null;

  const purpose = parseInt(m[1], 10);
  const expected = { p2wpkh: 84, "p2sh-p2wpkh": 49, p2tr: 86, p2pkh: 44 };
  const expectedPurpose = expected[addressType];

  if (expectedPurpose !== undefined && purpose !== expectedPurpose) {
    return `type/path 不匹配: ${addressType} 期望 purpose ${expectedPurpose}', 实际为 ${purpose}'`;
  }
  return null;
}
