import "hardhat";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "ethers";
import { setupForkDeployer, FUNDED_ADDRESS } from "./shared-fork-test-helper.mjs";

describe("importAddress 单独测试", { concurrency: false }, () => {
  it("应该可以冒充账户并完成转账", async () => {
    const { provider, myAddress } = await setupForkDeployer("5");

    const fundedBalance = await provider.getBalance(FUNDED_ADDRESS);
    const myBalance = await provider.getBalance(myAddress);

    assert(fundedBalance > 0n, "富账户余额应大于 0");
    assert(myBalance >= parseEther("1"), "测试账户应至少收到 1 ETH");
  });
});
