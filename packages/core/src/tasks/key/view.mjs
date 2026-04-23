import path from "node:path";

import { revealStoredFileContent } from "../../modules/key/store.mjs";

/**
 * key.view: 解锁并查看已有加密 key 文件内容。
 *
 * @param {Object} options
 * @param {string} options.keyFile
 * @param {string} options.password
 * @returns {Promise<{keyFile:string,content:string}>}
 */
export async function keyView(options = {}) {
  const {
    keyFile,
    password,
  } = options;

  if (!keyFile) {
    throw new Error("keyFile 不能为空");
  }
  if (!password) {
    throw new Error("password 不能为空");
  }

  const resolved = path.resolve(process.cwd(), String(keyFile));
  const revealed = await revealStoredFileContent({
    storedFile: resolved,
    password,
  });

  return {
    keyFile: path.relative(process.cwd(), resolved),
    content: revealed.content,
  };
}
