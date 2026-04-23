import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { parseKeyFile } from "../../modules/key/parse.mjs";
import { preprocessKeyDocument } from "../../modules/key/preprocess.mjs";

const ENCRYPTED_FILE_SUFFIX = ".enc.json";
// 特殊标记：匹配无扩展名文件（如 btc-main、walletnew）
const NO_EXT_MARKER = "__NO_EXT__";
// NO_EXT_MARKER 放进默认列表，使无扩展名文件默认被扫描
const DEFAULT_EXTENSIONS = Object.freeze([".md", ".txt", ".key", NO_EXT_MARKER]);
const DEFAULT_ON_CONFLICT = "rename";

function createBatchId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function normalizeExtList(input) {
  if (input == null) {
    return [...DEFAULT_EXTENSIONS];
  }
  // 空字符串 "" 表示：包含无扩展名文件（区别于 null/undefined 的「使用默认」）
  if (input === "") {
    return [NO_EXT_MARKER, ...DEFAULT_EXTENSIONS];
  }

  const rawList = Array.isArray(input)
    ? input
    : String(input).split(/[|,]/);

  const out = rawList
    .map((item) => String(item ?? "").trim().toLowerCase())
    .map((item) => {
      if (item === "") return NO_EXT_MARKER;  // 空字符串 = 匹配无扩展名文件
      return item.startsWith(".") ? item : `.${item}`;
    });

  const unique = Array.from(new Set(out.filter((item) => item)));
  return unique.length > 0 ? unique : [...DEFAULT_EXTENSIONS];
}

async function walkFiles(rootDir, recursive) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const entry of entries) {
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...await walkFiles(abs, recursive));
      }
      continue;
    }
    if (entry.isFile()) {
      files.push(abs);
    }
  }
  return files;
}

function toPosixRel(rootDir, targetPath) {
  return path.relative(rootDir, targetPath).split(path.sep).join("/");
}

async function pathExists(targetPath) {
  return await fs.stat(targetPath).then(() => true).catch(() => false);
}

async function resolveConflictOutputPath(targetPath, onConflict) {
  const strategy = String(onConflict ?? DEFAULT_ON_CONFLICT).trim().toLowerCase();

  if (!(await pathExists(targetPath))) {
    return { finalPath: targetPath, conflict: false, action: "none" };
  }

  if (strategy === "overwrite") {
    return { finalPath: targetPath, conflict: true, action: "overwrite" };
  }

  if (strategy === "skip") {
    return { finalPath: targetPath, conflict: true, action: "skip" };
  }

  if (strategy !== "rename") {
    throw new Error(`不支持的 onConflict: ${strategy}`);
  }

  const parsed = path.parse(targetPath);
  for (let i = 1; i <= 9999; i += 1) {
    const nextPath = path.join(parsed.dir, `${parsed.name}.${i}${parsed.ext}`);
    if (!(await pathExists(nextPath))) {
      return { finalPath: nextPath, conflict: true, action: "rename" };
    }
  }

  throw new Error(`冲突重命名失败，超过最大尝试次数: ${targetPath}`);
}

/**
 * key.imports: 批量遍历目录下明文 key 文档，逐个加密写入 storage/key/imports/<batchId>。
 *
 * @param {Object} options
 * @param {string} options.inputDir
 * @param {string} options.password
 * @param {string} [options.storageRoot='storage']
 * @param {boolean} [options.recursive=true]
 * @param {string|string[]} [options.extensions=['.md','.txt','.key']]
 * @param {'rename'|'skip'|'overwrite'} [options.onConflict='rename']
 * @param {boolean} [options.skipExisting=true] - 兼容旧参数，等价于 onConflict=skip
 * @param {boolean} [options.failFast=false]
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<{ok:boolean,batchId:string,inputDir:string,outputDir:string,scanned:number,matched:number,imported:number,skipped:number,failed:number,results:Array}>}
 */
export async function keyImports(options = {}) {
  const inputDir = String(options.inputDir ?? "").trim();
  if (!inputDir) {
    throw new Error("inputDir 不能为空");
  }

  const password = String(options.password ?? "");
  if (!password || password.length < 8) {
    throw new Error("password 至少 8 位");
  }

  const storageRoot = String(options.storageRoot ?? "storage").trim() || "storage";
  const recursive = options.recursive !== false;
  const extensions = normalizeExtList(options.extensions);
  const onConflict = options.onConflict
    ? String(options.onConflict)
    : (options.skipExisting === true ? "skip" : DEFAULT_ON_CONFLICT);
  const failFast = Boolean(options.failFast);
  const dryRun = Boolean(options.dryRun);

  const sourceRoot = path.resolve(process.cwd(), inputDir);
  const st = await fs.stat(sourceRoot).catch(() => null);
  if (!st || !st.isDirectory()) {
    throw new Error(`inputDir 不是可用目录: ${sourceRoot}`);
  }

  const batchId = createBatchId();
  const outputRoot = path.resolve(process.cwd(), storageRoot, "key", "imports", batchId);

  const scannedFiles = await walkFiles(sourceRoot, recursive);
  const matchedFiles = scannedFiles.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === "" && extensions.includes(NO_EXT_MARKER)) return true;
    return extensions.includes(ext);
  });

  const results = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "key-imports-preprocess-"));

  try {
    for (const abs of matchedFiles) {
      const rel = toPosixRel(sourceRoot, abs);
      const rawOutputRel = path.join(storageRoot, "key", "imports", batchId, `${rel}${ENCRYPTED_FILE_SUFFIX}`);
      const rawOutputAbs = path.resolve(process.cwd(), rawOutputRel);

      try {
        const sourceText = await fs.readFile(abs, "utf8");
        const preprocessed = preprocessKeyDocument({ sourceText });
        const parsed = parseKeyFile(preprocessed.content);
        if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
          throw new Error("未解析到有效密钥条目");
        }

        const resolvedOutput = await resolveConflictOutputPath(rawOutputAbs, onConflict);
        if (resolvedOutput.action === "skip") {
          skipped += 1;
          results.push({
            inputFile: rel,
            outputFile: path.relative(process.cwd(), rawOutputAbs),
            status: "skipped",
            reason: "目标文件已存在",
            entryCount: parsed.entries.length,
            generatedCount: preprocessed.generated.length,
            warnings: [
              ...(Array.isArray(preprocessed.warnings) ? preprocessed.warnings : []),
              ...(Array.isArray(parsed.errors) ? parsed.errors : []),
            ],
          });
          continue;
        }

        const outputAbs = resolvedOutput.finalPath;
        const outputRel = path.relative(process.cwd(), outputAbs);

        if (!dryRun) {
          const tempInput = path.join(tempRoot, `${rel}.preprocessed.md`);
          await fs.mkdir(path.dirname(tempInput), { recursive: true });
          await fs.writeFile(tempInput, preprocessed.content, "utf8");
          await encryptPathToFile({
            inputPath: tempInput,
            password,
            outputFile: outputAbs,
          });
        }

        imported += 1;
        results.push({
          inputFile: rel,
          outputFile: outputRel,
          status: "imported",
          conflictAction: resolvedOutput.action,
          entryCount: parsed.entries.length,
          generatedCount: preprocessed.generated.length,
          warnings: [
            ...(Array.isArray(preprocessed.warnings) ? preprocessed.warnings : []),
            ...(Array.isArray(parsed.errors) ? parsed.errors : []),
          ],
        });
      } catch (error) {
        failed += 1;
        const message = String(error?.message ?? error);
        results.push({
          inputFile: rel,
          outputFile: path.relative(process.cwd(), rawOutputAbs),
          status: "failed",
          reason: message,
        });
        if (failFast) {
          break;
        }
      }
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  return {
    ok: true,
    batchId,
    cwd: process.cwd(),
    inputDir: path.relative(process.cwd(), sourceRoot),
    outputDir: path.relative(process.cwd(), outputRoot),
    outputDirAbs: outputRoot,
    dryRun,
    scanned: scannedFiles.length,
    matched: matchedFiles.length,
    imported,
    skipped,
    failed,
    results,
  };
}

export default keyImports;
