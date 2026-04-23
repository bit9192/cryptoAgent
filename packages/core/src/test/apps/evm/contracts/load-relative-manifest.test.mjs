import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadContractArtifact } from "../../../../../contracts/load.mjs";

async function mkTmpDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("loadContractArtifact: 支持 manifest 中的相对 artifactPath", async () => {
  const baseDir = await mkTmpDir("evm-relative-manifest-");
  const manifestDir = path.join(baseDir, "manifest");
  const artifactDir = path.join(baseDir, "artifacts", "dev", "Test");
  const manifestPath = path.join(manifestDir, "contracts.manifest.json");
  const artifactPath = path.join(artifactDir, "TEST11111.json");

  await fs.mkdir(manifestDir, { recursive: true });
  await fs.mkdir(artifactDir, { recursive: true });

  await fs.writeFile(artifactPath, `${JSON.stringify({
    contractName: "TEST11111",
    sourceName: "dev/Test.sol",
    abi: [],
    bytecode: "0x1234",
    deployedBytecode: "0x5678",
  }, null, 2)}\n`, "utf8");

  await fs.writeFile(manifestPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    profile: "test",
    compilerVersion: "0.8.34",
    sourceDir: "../src",
    outDir: "../artifacts",
    abiDir: "./abi",
    entries: [
      {
        contractName: "TEST11111",
        sourceName: "dev/Test.sol",
        artifactPath: "../artifacts/dev/Test/TEST11111.json",
        abiPath: "./abi/dev/Test/TEST11111.abi.json",
        hasBytecode: true,
      },
    ],
  }, null, 2)}\n`, "utf8");

  const loaded = await loadContractArtifact({
    manifestPath,
    contractName: "TEST11111",
  });

  assert.equal(loaded.artifact.contractName, "TEST11111");
  assert.equal(loaded.artifact.sourceName, "dev/Test.sol");
  assert.equal(loaded.artifactPath, artifactPath);
});