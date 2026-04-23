import "hardhat";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createErc20,
  deployDappSuite,
} from "../../../../../src/index.mjs";
import { Contract, NonceManager } from "ethers";
import { setupForkDeployer, deployMockToken, loadArtifact } from "./shared-fork-test-helper.mjs";

describe("swapv3 单独测试", { concurrency: false }, () => {
  it("应该完成 V3 建池、加流动性、swap 和 quoter 查询", async () => {
    const { signer, myAddress } = await setupForkDeployer("10");

    const tokenAInfo = await deployMockToken("TestCoin", "TKC", signer);
    const tokenBInfo = await deployMockToken("USDT", "USDT", signer);

    const tokenAV3 = createErc20({ tokenName: "TestCoin", address: tokenAInfo.address, signer });
    const tokenBV3 = createErc20({ tokenName: "USDT", address: tokenBInfo.address, signer });
  const txSigner = new NonceManager(signer.signer.connect(signer.provider));
  const tokenAV3Tx = createErc20({ tokenName: "TestCoin", address: tokenAInfo.address, signer: txSigner });
  const tokenBV3Tx = createErc20({ tokenName: "USDT", address: tokenBInfo.address, signer: txSigner });


    const deployed = await deployDappSuite(
      [
        { name: "WETH", key: "weth" },
        { name: "UniswapV3Factory", key: "factory" },
        { name: "SwapRouter", key: "router", args: ["${factory.address}", "${weth.address}"] },
        { name: "QuoterV2", key: "quoterV2", args: ["${factory.address}"] },
        { name: "NonfungiblePositionManager", key: "positionManager", args: ["${factory.address}", "${weth.address}"] },
      ],
      { signer }
    );

    const factoryAbi = loadArtifact("UniswapV3Factory")?.abi;
    const routerAbi = loadArtifact("SwapRouter")?.abi;
    const quoterV2Abi = loadArtifact("QuoterV2")?.abi;
    const positionManagerAbi = loadArtifact("NonfungiblePositionManager")?.abi;
    const poolAbi = loadArtifact("UniswapV3Pool")?.abi;
    assert(Array.isArray(factoryAbi) && factoryAbi.length > 0, "UniswapV3Factory ABI 不可用");
    assert(Array.isArray(routerAbi) && routerAbi.length > 0, "SwapRouter ABI 不可用");
    assert(Array.isArray(quoterV2Abi) && quoterV2Abi.length > 0, "QuoterV2 ABI 不可用");
    assert(Array.isArray(positionManagerAbi) && positionManagerAbi.length > 0, "PositionManager ABI 不可用");
    assert(Array.isArray(poolAbi) && poolAbi.length > 0, "UniswapV3Pool ABI 不可用");

    const factory = new Contract(deployed.factory.address, factoryAbi, txSigner);
    const router = new Contract(deployed.router.address, routerAbi, txSigner);
    const positionManager = new Contract(deployed.positionManager.address, positionManagerAbi, txSigner);

    const fee = 3000;
    const createPoolTx = await factory.createPool(tokenAInfo.address, tokenBInfo.address, fee);
    await createPoolTx.wait();

    const poolAddress = await factory.getPool(tokenAInfo.address, tokenBInfo.address, fee);
    assert(poolAddress && poolAddress !== "0x0000000000000000000000000000000000000000", "Pool 地址无效");

    const pool = new Contract(poolAddress, poolAbi, txSigner);
    const sqrtPriceX96 = 2n ** 96n;
    const initTx = await pool.initialize(sqrtPriceX96);
    await initTx.wait();

    const token0 = tokenAInfo.address.toLowerCase() < tokenBInfo.address.toLowerCase()
      ? tokenAInfo.address
      : tokenBInfo.address;
    const token1 = token0 === tokenAInfo.address ? tokenBInfo.address : tokenAInfo.address;

    const amount0Desired = 1_000n * 10n ** 18n;
    const amount1Desired = 1_000n * 10n ** 18n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    let tx = await tokenAV3Tx.approve(positionManager.target, amount0Desired);
    await tx.wait();
    tx = await tokenBV3Tx.approve(positionManager.target, amount1Desired);
    await tx.wait();

    tx = await positionManager.mint({
      token0,
      token1,
      fee,
      tickLower: -60000,
      tickUpper: 60000,
      amount0Desired,
      amount1Desired,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: myAddress,
      deadline,
    });
    await tx.wait();

    const beforeB = await tokenBV3Tx.balanceOf(myAddress);
    const swapIn = 10n * 10n ** 18n;

    tx = await tokenAV3Tx.approve(router.target, swapIn);
    await tx.wait();

    tx = await router.exactInputSingle({
      tokenIn: tokenAInfo.address,
      tokenOut: tokenBInfo.address,
      fee,
      recipient: myAddress,
      deadline,
      amountIn: swapIn,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    });
    await tx.wait();

    const afterB = await tokenBV3Tx.balanceOf(myAddress);
    assert(afterB > beforeB, "swap 后 USDT 应增加");

    const quoter = new Contract(deployed.quoterV2.address, quoterV2Abi, txSigner);
    const quote = await quoter.quoteExactInputSingle(
      tokenAInfo.address,
      tokenBInfo.address,
      swapIn,
      fee,
      0n,
    );

    assert(quote.amountOut > 0n, "quoter 输出应大于 0");
  });
});
