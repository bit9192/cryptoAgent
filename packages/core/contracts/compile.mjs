import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const MODULE_FILE = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(MODULE_FILE);
const CONTRACTS_DIR = MODULE_DIR;
const SRC_DIR = path.join(CONTRACTS_DIR, "src");
const DEFAULT_OUT_DIR = path.join(CONTRACTS_DIR, "artifacts");
const DEFAULT_MANIFEST_PATH = path.join(CONTRACTS_DIR, "manifest", "contracts.manifest.json");
const DEFAULT_ABI_DIR = path.join(CONTRACTS_DIR, "manifest", "abi");

function parseArgs(argv = []) {
  const options = {
    profile: "production",
    outDir: DEFAULT_OUT_DIR,
    abiDir: DEFAULT_ABI_DIR,
    manifestPath: DEFAULT_MANIFEST_PATH,
    clean: false,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "").trim();
    if (!token) continue;
    if (token === "--clean") {
      options.clean = true;
      continue;
    }
    if (token === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (token === "--profile") {
      options.profile = String(argv[i + 1] ?? options.profile).trim() || options.profile;
      i += 1;
      continue;
    }
    if (token.startsWith("--profile=")) {
      options.profile = token.slice("--profile=".length).trim() || options.profile;
      continue;
    }
    if (token === "--outDir") {
      options.outDir = path.resolve(String(argv[i + 1] ?? options.outDir));
      i += 1;
      continue;
    }
    if (token.startsWith("--outDir=")) {
      options.outDir = path.resolve(token.slice("--outDir=".length));
      continue;
    }
    if (token === "--manifest") {
      options.manifestPath = path.resolve(String(argv[i + 1] ?? options.manifestPath));
      i += 1;
      continue;
    }
    if (token.startsWith("--manifest=")) {
      options.manifestPath = path.resolve(token.slice("--manifest=".length));
      continue;
    }
    if (token === "--abiDir") {
      options.abiDir = path.resolve(String(argv[i + 1] ?? options.abiDir));
      i += 1;
      continue;
    }
    if (token.startsWith("--abiDir=")) {
      options.abiDir = path.resolve(token.slice("--abiDir=".length));
      continue;
    }
  }

  return options;
}

function normalizeProfile(profile) {
  const value = String(profile ?? "production").trim().toLowerCase();
  if (["all", "production", "test"].includes(value)) return value;
  throw new Error(`不支持的 compile profile: ${profile}`);
}

function shouldIncludeSource(relativeSourcePath, profile) {
  const rel = String(relativeSourcePath ?? "").replace(/\\/g, "/");
  if (!rel) return false;
  if (profile === "all") return true;
  if (profile === "production") {
    return !rel.startsWith("dev/") && !rel.startsWith("mocks/");
  }
  if (profile === "test") {
    return !rel.startsWith("dev/");
  }
  return true;
}

async function readSolidityFilesRecursively(dirPath, output = []) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await readSolidityFilesRecursively(fullPath, output);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".sol")) {
      output.push(fullPath);
    }
  }
  return output;
}

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function resolveImportSync(importPath) {
  const candidates = [
    path.join(SRC_DIR, importPath),
    path.join(CONTRACTS_DIR, importPath),
  ];

  let cursor = CONTRACTS_DIR;
  for (let level = 0; level < 8; level += 1) {
    candidates.push(path.join(cursor, "node_modules", importPath));
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  for (const candidate of candidates) {
    try {
      const content = fsSync.readFileSync(candidate, "utf8");
      return { contents: content };
    } catch {
      // continue
    }
  }

  return { error: `import not found: ${importPath}` };
}

function buildCompilerInput(sources) {
  return {
    language: "Solidity",
    sources,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode.object",
            "evm.deployedBytecode.object",
            "metadata",
          ],
        },
      },
    },
  };
}

function formatErrorLine(error) {
  const level = String(error?.severity ?? "error").toLowerCase();
  const location = error?.sourceLocation?.file
    ? `${error.sourceLocation.file}:${error.sourceLocation.start ?? 0}`
    : "unknown";
  const msg = String(error?.formattedMessage ?? error?.message ?? "unknown error").trim();
  return `[${level}] ${location} ${msg}`;
}

async function writeArtifactFiles(compiledContracts, options) {
  const entries = [];

  for (const [sourceName, contracts] of Object.entries(compiledContracts)) {
    for (const [contractName, output] of Object.entries(contracts ?? {})) {
      const abi = Array.isArray(output?.abi) ? output.abi : [];
      const bytecodeRaw = String(output?.evm?.bytecode?.object ?? "").trim();
      const deployedBytecodeRaw = String(output?.evm?.deployedBytecode?.object ?? "").trim();
      const bytecode = bytecodeRaw ? `0x${bytecodeRaw}` : "0x";
      const deployedBytecode = deployedBytecodeRaw ? `0x${deployedBytecodeRaw}` : "0x";

      const sourceWithoutExt = sourceName.replace(/\.sol$/i, "");
      const artifactDir = path.join(options.outDir, sourceWithoutExt);
      const artifactPath = path.join(artifactDir, `${contractName}.json`);
      const abiDir = path.join(options.abiDir, sourceWithoutExt);
      const abiPath = path.join(abiDir, `${contractName}.abi.json`);

      await ensureDir(artifactDir);
      await ensureDir(abiDir);

      const artifact = {
        contractName,
        sourceName,
        abi,
        bytecode,
        deployedBytecode,
        compilerVersion: solc.version(),
      };

      await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      await fs.writeFile(abiPath, `${JSON.stringify(abi, null, 2)}\n`, "utf8");

      entries.push({
        contractName,
        sourceName,
        artifactPath,
        abiPath,
        hasBytecode: bytecode !== "0x",
      });
    }
  }

  return entries;
}

export async function compileContracts(rawOptions = {}) {
  const options = {
    profile: normalizeProfile(rawOptions.profile ?? "production"),
    outDir: path.resolve(String(rawOptions.outDir ?? DEFAULT_OUT_DIR)),
    abiDir: path.resolve(String(rawOptions.abiDir ?? DEFAULT_ABI_DIR)),
    manifestPath: path.resolve(String(rawOptions.manifestPath ?? DEFAULT_MANIFEST_PATH)),
    clean: Boolean(rawOptions.clean),
    quiet: Boolean(rawOptions.quiet),
  };

  const sourceFiles = await readSolidityFilesRecursively(SRC_DIR);
  const selected = sourceFiles
    .map((abs) => ({ abs, rel: path.relative(SRC_DIR, abs).replace(/\\/g, "/") }))
    .filter((row) => shouldIncludeSource(row.rel, options.profile));

  if (selected.length === 0) {
    throw new Error(`没有可编译的合约文件（profile=${options.profile}）`);
  }

  if (options.clean) {
    await ensureCleanDir(options.outDir);
    await ensureCleanDir(options.abiDir);
  }
  await ensureDir(path.dirname(options.manifestPath));
  await ensureDir(options.outDir);
  await ensureDir(options.abiDir);

  const sources = {};
  for (const item of selected) {
    sources[item.rel] = { content: await fs.readFile(item.abs, "utf8") };
  }

  const input = buildCompilerInput(sources);
  const outputRaw = solc.compile(JSON.stringify(input), {
    import: (importPath) => resolveImportSync(importPath),
  });

  const output = JSON.parse(outputRaw);
  const diagnostics = Array.isArray(output?.errors) ? output.errors : [];
  const compileErrors = diagnostics.filter((e) => String(e?.severity).toLowerCase() === "error");

  if (!options.quiet) {
    for (const line of diagnostics.map(formatErrorLine)) {
      console.log(line);
    }
  }

  if (compileErrors.length > 0) {
    throw new Error(`solc 编译失败，共 ${compileErrors.length} 个错误`);
  }

  const contracts = output?.contracts ?? {};
  const entries = await writeArtifactFiles(contracts, options);

  const manifest = {
    generatedAt: new Date().toISOString(),
    profile: options.profile,
    compilerVersion: solc.version(),
    sourceDir: SRC_DIR,
    outDir: options.outDir,
    abiDir: options.abiDir,
    entries,
  };

  await fs.writeFile(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    ok: true,
    profile: options.profile,
    compilerVersion: solc.version(),
    sources: selected.length,
    contracts: entries.length,
    manifestPath: options.manifestPath,
    outDir: options.outDir,
    abiDir: options.abiDir,
    entries,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await compileContracts(args);
  if (!args.quiet) {
    console.log(`compiled contracts: ${result.contracts}`);
    console.log(`manifest: ${result.manifestPath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(MODULE_FILE)) {
  main().catch((error) => {
    console.error(`compile 失败: ${error.message}`);
    process.exitCode = 1;
  });
}
