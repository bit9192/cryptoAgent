import { assertKeyFileNotExists, normalizeName } from "./shared.mjs";
import { storeEncryptedEnvelope } from "../../modules/key/store.mjs";

export async function keyPageImport(options = {}) {
  const {
    name,
    envelope,
    storageRoot = "storage",
  } = options;

  const normalizedName = normalizeName(name, "page");
  if (!envelope || typeof envelope !== "object") {
    throw new Error("envelope 不能为空");
  }

  await assertKeyFileNotExists({ storageRoot, name: normalizedName });
  const stored = await storeEncryptedEnvelope({
    envelope,
    storageRoot,
    bucket: "common",
    fileName: `${normalizedName}.enc.json`,
  });

  return {
    name: normalizedName,
    keyFile: stored.storedFile,
    fileCount: stored.fileCount,
    sourceType: stored.sourceType,
    sourceName: stored.sourceName,
  };
}
