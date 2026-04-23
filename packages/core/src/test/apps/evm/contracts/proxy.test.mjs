import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getDeploymentRecord } from "../../../../apps/evm/contracts/deployment-registry.mjs";
import { deployProxy, upProxy, getContract } from "../../../../apps/evm/contracts/deploy.mjs";

async function mkTmpDir(prefix) {
	return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("deployProxy/upProxy: 可部署并升级透明代理", { timeout: 180000 }, async () => {
	const deploymentDir = await mkTmpDir("evm-proxy-");

	const deployed = await deployProxy("TestUpgradeable1", ["Upgradeable Token", 1000n], {
		deploymentDirs: [deploymentDir],
		networkName: "hardhat",
		kind: "transparent",
	});

	assert.equal(typeof deployed.proxyAddress, "string");
	assert.equal(deployed.address, deployed.proxyAddress);
	assert.ok(deployed.proxyAddress.startsWith("0x"));
	assert.ok(deployed.implementationAddress?.startsWith("0x"));
	assert.equal(await deployed.contract.version(), "v1");
	assert.equal(await deployed.contract.value(), 1000n);

	const proxyV1 = await getContract("TestUpgradeable1", null, {
		chainId: deployed.chainId,
		deploymentDirs: [deploymentDir],
		networkName: "hardhat",
	});
	assert.equal(await proxyV1.version(), "v1");
	assert.equal(await proxyV1.value(), 1000n);

	const upgraded = await upProxy("TestUpgradeableV123", deployed.proxyAddress, {
		deploymentDirs: [deploymentDir],
		networkName: "hardhat",
		kind: "transparent",
	});

	assert.equal(upgraded.proxyAddress.toLowerCase(), deployed.proxyAddress.toLowerCase());
	assert.ok(upgraded.implementationAddress?.startsWith("0x"));
	assert.notEqual(upgraded.implementationAddress?.toLowerCase(), deployed.implementationAddress?.toLowerCase());
	assert.equal(await upgraded.contract.version(), "v2");
	assert.equal(await upgraded.contract.value(), 1000n);

	const proxyV2 = await getContract("TestUpgradeableV123", null, {
		chainId: upgraded.chainId,
		deploymentDirs: [deploymentDir],
		networkName: "hardhat",
	});
	assert.equal(await proxyV2.version(), "v2");
	assert.equal(await proxyV2.value(), 1000n);

	const incrementTx = await upgraded.contract.increment();
	await incrementTx.wait();
	assert.equal(await proxyV2.value(), 1001n);

	const saved = await getDeploymentRecord({
		chainId: upgraded.chainId,
		deploymentDirs: [deploymentDir],
		kind: "proxies",
		deploymentKey: deployed.deploymentKey,
	});
	assert.equal(saved.record.contractName, "TestUpgradeableV123");
	assert.equal(saved.record.address.toLowerCase(), deployed.proxyAddress.toLowerCase());
	assert.equal(Array.isArray(saved.record.history), true);
	assert.equal(saved.record.history.length, 2);
	assert.equal(saved.record.history[0].implementation.toLowerCase(), deployed.implementationAddress.toLowerCase());
	assert.equal(saved.record.history[1].implementation.toLowerCase(), upgraded.implementationAddress.toLowerCase());
});