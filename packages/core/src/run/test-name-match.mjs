import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { extractData } from "../modules/data-engine/index.mjs";
import { retrieveWalletKeyCandidates } from "../modules/wallet-engine/index.mjs";

const ADDRESS_CONFIG_LINES = [
  "@address-config chain=evm path=m/*'/*'/*'/*/[0,2] name=s",
  "@address-config chain=trx path=m/*'/*'/*'/*/3 name=s-trx",
  "@address-config chain=evm path=m/*'/*'/*'/*/[4,7] name=m",
  "@address-config chain=evm path=m/*'/*'/*'/*/9 name=u",
  "@address-config chain=evm path=m/*'/*'/*'/*/10 name=h",
  "@address-config chain=evm path=m/*'/*'/*'/*/12 name=x",
  "@address-config chain=evm path=m/*'/*'/*'/*/13 name=h1",
  "@address-config chain=evm path=m/*'/*'/*'/*/14 name=s-m",
  "@address-config chain=evm path=m/*'/*'/*'/*/[15,17] name=is",
  "@address-config chain=evm path=m/*'/*'/*'/*/[18,22] name=ha",
  "@address-config chain=evm path=m/*'/*'/*'/*/23 name=xd",
  "@address-config chain=evm path=m/*'/*'/*'/*/[24,27] name=mdo",
  "@address-config chain=evm path=m/*'/*'/*'/*/28 name=fxss",
  "@address-config chain=evm path=m/*'/*'/*'/*/29 name=m-c",
  "@address-config chain=trx path=m/*'/*'/*'/*/30 name=s-trx",
];

function parseDirectiveLine(line) {
  const text = String(line ?? "").trim();
  if (!text.startsWith("@address-config")) {
    return null;
  }

  const body = text.replace(/^@address-config\s+/, "");
  const fields = {};
  for (const token of body.split(/\s+/)) {
    const [k, v] = token.split("=");
    if (!k || v == null) continue;
    fields[k] = v;
  }

  const chain = String(fields.chain ?? "").trim().toLowerCase();
  const path = String(fields.path ?? "").trim();
  const name = String(fields.name ?? "").trim();

  if (!chain || !path || !name) {
    return null;
  }

  return { chain, pathPattern: path, baseName: name };
}

function parsePathIndexRange(pathPattern) {
  const rangeMatch = pathPattern.match(/\[(\d+),(\d+)\]$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      return [];
    }

    const out = [];
    for (let i = start; i <= end; i += 1) {
      out.push({ index: i, path: pathPattern.replace(/\[(\d+),(\d+)\]$/, String(i)) });
    }
    return out;
  }

  const singleMatch = pathPattern.match(/\/(\d+)$/);
  if (singleMatch) {
    const index = Number(singleMatch[1]);
    if (Number.isInteger(index)) {
      return [{ index, path: pathPattern }];
    }
  }

  return [];
}

function mockAddress(chain, index) {
  if (chain === "evm") {
    return `0x${String(index).padStart(40, "0")}`;
  }
  if (chain === "trx") {
    return `T${String(index).padStart(33, "0")}`;
  }
  return `${chain}-${index}`;
}

function expandAddressConfigs(lines) {
  const rows = [];

  for (const line of lines) {
    const config = parseDirectiveLine(line);
    if (!config) continue;

    const expanded = parsePathIndexRange(config.pathPattern);
    for (const item of expanded) {
      const name = `${config.baseName}-${item.index}`;
      rows.push({
        chain: config.chain,
        path: item.path,
        index: item.index,
        baseName: config.baseName,
        name,
        keyName: name,
        keyId: `k-${config.baseName}-${item.index}`,
        address: mockAddress(config.chain, item.index),
      });
    }
  }

  return rows;
}

function printRows(label, rows) {
  const names = rows.map((r) => r.name ?? r.keyName).sort();
  console.log(`\n[${label}] count=${rows.length}`);
  console.log(names.join(", "));
}

function runNameMatchCases(input) {
  const containsIs = extractData({
    input,
    sourcePath: "addresses[*]",
    filters: [{ field: "name", op: "contains", value: "is" }],
    select: ["name", "baseName", "index", "chain", "path"],
  });

  const eqIs16 = extractData({
    input,
    sourcePath: "addresses[*]",
    filters: [{ field: "name", op: "eq", value: "is-16" }],
    select: ["name", "index", "chain", "path"],
  });

  const eqNameIs15 = extractData({
    input,
    sourcePath: "addresses[*]",
    filters: [{ field: "name", op: "eq", value: "is-15" }],
    select: ["name", "index", "chain", "path"],
  });

  printRows("name contains 'is'", containsIs);
  printRows("name eq 'is-16'", eqIs16);
  printRows("name eq 'is-15'", eqNameIs15);

  assert.deepEqual(
    containsIs.map((r) => r.name).sort(),
    ["is-15", "is-16", "is-17"],
  );
  assert.deepEqual(eqIs16.map((r) => r.name), ["is-16"]);
  assert.deepEqual(eqNameIs15.map((r) => r.name), ["is-15"]);
}

function buildWalletStatusFromAddresses(addresses) {
  const keysMap = new Map();
  for (const row of addresses) {
    const keyId = String(row?.keyId ?? "").trim();
    if (!keyId || keysMap.has(keyId)) continue;
    keysMap.set(keyId, {
      keyId,
      keyName: row?.keyName ?? row?.name ?? null,
      keyType: "hd",
      source: "mock",
      status: "active",
    });
  }
  return {
    keys: Array.from(keysMap.values()),
    addresses,
  };
}

function selectorQueryName(selectors, walletStatus) {
  const keys = retrieveWalletKeyCandidates(selectors, walletStatus);
  return keys.map((k) => k.keyName).sort();
}

function runCompareCases(addresses) {
  const input = { addresses };
  const walletStatusWithKeys = buildWalletStatusFromAddresses(addresses);
  runCompareCasesWithStatus(input, walletStatusWithKeys, "synthetic-keys");
}

function expectedKeyNamesBySelectors(selectors, walletStatus) {
  const keys = Array.isArray(walletStatus?.keys) ? walletStatus.keys : [];
  const target = String(selectors?.name ?? selectors?.keyName ?? "").trim().toLowerCase();
  const exact = Boolean(selectors?.nameExact);
  if (!target) return keys.map((k) => String(k?.keyName ?? "")).filter(Boolean).sort();
  const out = keys
    .map((k) => String(k?.keyName ?? "").trim())
    .filter(Boolean)
    .filter((name) => {
      const text = name.toLowerCase();
      return exact ? text === target : text.includes(target);
    })
    .sort();
  return out;
}

function runCompareCasesWithStatus(input, walletStatusWithKeys, label = "status") {
  const addresses = Array.isArray(input?.addresses) ? input.addresses : [];
  const walletStatusWithoutKeys = { keys: [], addresses };

  const dataContains = extractData({
    input,
    sourcePath: "addresses[*]",
    filters: [{ field: "name", op: "contains", value: "is" }],
    select: ["name"],
  }).map((r) => r.name).sort();

  const selectorContainsWithKeys = selectorQueryName(
    { name: "is", nameExact: false },
    walletStatusWithKeys,
  );

  const selectorExactWithKeys = selectorQueryName(
    { name: "is-16", nameExact: true },
    walletStatusWithKeys,
  );

  const selectorContainsWithoutKeys = selectorQueryName(
    { name: "is", nameExact: false },
    walletStatusWithoutKeys,
  );

  console.log(`\n=== Compare: data-engine vs selectors (${label}) ===`);
  console.log("data-engine contains(name,'is') =>", dataContains.join(", "));
  console.log("selectors {name:'is',nameExact:false} with keys =>", selectorContainsWithKeys.join(", "));
  console.log("selectors {name:'is-16',nameExact:true} with keys =>", selectorExactWithKeys.join(", "));
  console.log("selectors {name:'is',nameExact:false} without keys =>", selectorContainsWithoutKeys.join(", "));

  assert.deepEqual(dataContains, ["is-15", "is-16", "is-17"]);
  assert.deepEqual(
    selectorContainsWithKeys,
    expectedKeyNamesBySelectors({ name: "is", nameExact: false }, walletStatusWithKeys),
  );
  assert.deepEqual(
    selectorExactWithKeys,
    expectedKeyNamesBySelectors({ name: "is-16", nameExact: true }, walletStatusWithKeys),
  );
  assert.deepEqual(selectorContainsWithoutKeys, []);
}

async function loadStatusFromFile(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(text);
  return {
    keys: Array.isArray(parsed?.keys) ? parsed.keys : [],
    addresses: Array.isArray(parsed?.addresses) ? parsed.addresses : [],
  };
}

export async function run() {
  const addresses = expandAddressConfigs(ADDRESS_CONFIG_LINES);
  const input = { addresses };

  console.log("Address config rows generated:", addresses.length);
  runNameMatchCases(input);
  runCompareCases(addresses);

  const statusFile = process.argv[2];
  if (statusFile) {
    const walletStatusFromFile = await loadStatusFromFile(statusFile);
    const fileInput = { addresses: walletStatusFromFile.addresses };
    console.log("\nStatus file loaded:", statusFile);
    console.log("status.keys:", walletStatusFromFile.keys.length, "status.addresses:", walletStatusFromFile.addresses.length);
    runNameMatchCases(fileInput);
    runCompareCasesWithStatus(fileInput, walletStatusFromFile, "file-status");
  }

  console.log("\nName match tests passed.");
}

const currentFileUrl = new URL(import.meta.url);
if (process.argv[1] && currentFileUrl.pathname.endsWith(process.argv[1])) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
