import "hardhat";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createErc20 } from "../../../../../src/index.mjs";
import { setupForkDeployer, deployMockToken } from "./shared-fork-test-helper.mjs";

describe("deploy tokens 单独测试", { concurrency: false }, () => {
  it("应该可以部署 TestCoin 和 USDT，并包装为 ERC20", async () => {
    const { signer } = await setupForkDeployer("5");

    const tokenA = await deployMockToken("TestCoin", "TKA", signer);
    const tokenB = await deployMockToken("USDT", "USDT", signer);

    const erc20A = createErc20({ tokenName: "TestCoin", address: tokenA.address, signer });
    const erc20B = createErc20({ tokenName: "USDT", address: tokenB.address, signer });

    const symbolA = await erc20A.symbol();
    const symbolB = await erc20B.symbol();

    assert.equal(symbolA, "TKA", "TokenA 符号应为 TKA");
    assert(symbolB.toUpperCase().startsWith("USDT"), "TokenB 符号应以 USDT 开头");
  });
});
