import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { createDefaultWallet } from "../../apps/default-wallet.mjs";

function defaultOutputPath(inputPath) {
  const abs = path.resolve(process.cwd(), String(inputPath));
  const parsed = path.parse(abs);
  return path.join(parsed.dir, `${parsed.name}.addresses.json`);
}

function uniqueList(items) {
  return Array.from(new Set((items ?? []).map((x) => String(x ?? "").trim()).filter(Boolean)));
}

/**
 * key.derive-config: 从 key 文档导出地址配置派生结果。
 *
 * @param {Object} options
 * @param {string} options.inputPath
 * @param {string} [options.outputPath]
 * @param {string} options.password
 * @param {boolean} [options.strict=false]
 * @returns {Promise<{sourceFile:string,outputFile:string,keysTotal:number,keysWithConfig:number,strict:boolean}>}
 */
export async function keyDeriveConfig(options = {}) {
  const inputPath = String(options.inputPath ?? "").trim();
  if (!inputPath) {
    throw new Error("inputPath 不能为空");
  }

  const password = String(options.password ?? "").trim();
  if (!password) {
    throw new Error("password 不能为空");
  }

  const strict = Boolean(options.strict);
  const sourceFile = path.resolve(process.cwd(), inputPath);
  const outputFile = path.resolve(
    process.cwd(),
    String(options.outputPath ?? defaultOutputPath(sourceFile)),
  );

  const st = await fs.stat(sourceFile).catch(() => null);
  if (!st || !st.isFile()) {
    throw new Error(`输入文件不存在: ${sourceFile}`);
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "key-derive-config-"));
  try {
    const encryptedFile = path.join(tmpRoot, "key", "derived.enc.json");
    await fs.mkdir(path.dirname(encryptedFile), { recursive: true });

    await encryptPathToFile({
      inputPath: sourceFile,
      password,
      outputFile: encryptedFile,
    });

    const wallet = await createDefaultWallet({
      wallet: { baseDir: tmpRoot },
    });

    await wallet.loadKeyFile({
      password,
      files: ["key/derived.enc.json"],
    });

    const keyList = await wallet.listKeys();
    const results = [];

    for (const item of keyList.items) {
      try {
        await wallet.unlock({ keyId: item.keyId, password });
        const derived = await wallet.deriveConfiguredAddresses({
          keyId: item.keyId,
          strict,
        });

        results.push({
          keyId: item.keyId,
          keyName: item.name,
          type: item.type,
          derivedCount: derived.items.length,
          items: derived.items,
          warnings: uniqueList(derived.warnings),
        });
      } catch (error) {
        results.push({
          keyId: item.keyId,
          keyName: item.name,
          type: item.type,
          derivedCount: 0,
          items: [],
          warnings: [String(error?.message ?? error)],
        });
      }
    }

    const payload = {
      sourceFile: path.relative(process.cwd(), sourceFile),
      generatedAt: new Date().toISOString(),
      strict,
      keysTotal: keyList.total,
      keysWithConfig: results.filter((r) => r.derivedCount > 0).length,
      warnings: uniqueList(results.flatMap((r) => r.warnings)),
      results,
    };

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    return {
      sourceFile: payload.sourceFile,
      outputFile: path.relative(process.cwd(), outputFile),
      keysTotal: payload.keysTotal,
      keysWithConfig: payload.keysWithConfig,
      strict,
    };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}
