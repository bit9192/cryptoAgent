import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = path.join(MODULE_DIR, "manifest", "contracts.manifest.json");

export async function loadContractManifest(input = {}) {
  const manifestPath = path.resolve(String(input.manifestPath ?? DEFAULT_MANIFEST_PATH));
  const text = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(text);
  return {
    manifestPath,
    manifest,
  };
}

export async function loadContractArtifact(input = {}) {
  const contractName = String(input.contractName ?? "").trim();
  const sourceName = String(input.sourceName ?? "").trim();
  if (!contractName) throw new Error("contractName 不能为空");

  const { manifestPath, manifest } = await loadContractManifest(input);
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const matched = entries.find((entry) => (
    String(entry?.contractName ?? "") === contractName
    && (sourceName ? String(entry?.sourceName ?? "") === sourceName : true)
  ));

  if (!matched) {
    throw new Error(`manifest 中未找到合约: ${contractName}${sourceName ? ` (${sourceName})` : ""}`);
  }

  const artifactPath = path.resolve(String(matched.artifactPath));
  const text = await fs.readFile(artifactPath, "utf8");
  const artifact = JSON.parse(text);

  return {
    manifestPath,
    artifactPath,
    artifact,
  };
}
