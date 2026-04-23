import "hardhat";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createErc20,
  deployDappSuite,
} from "../../../../../src/index.mjs";
import { Contract, NonceManager } from "ethers";
import { setupForkDeployer, deployMockToken, loadArtifact } from "./shared-fork-test-helper.mjs";

describe("swapv2 单独测试", { concurrency: false }, () => {
  it("应该完成 V2 创建交易对、注入流动性并 swap", async () => {
    const { signer, myAddress } = await setupForkDeployer("10");

    const tokenAInfo = await deployMockToken("TestCoin", "TKA", signer);
    const tokenBInfo = await deployMockToken("USDT", "USDT", signer);

    const tokenA = createErc20({ tokenName: "TestCoin", address: tokenAInfo.address, signer });
    const tokenB = createErc20({ tokenName: "USDT", address: tokenBInfo.address, signer });

    const deployed = await deployDappSuite(
      [
        { name: "WETH", key: "weth" },
        { name: "UniFactory", key: "factory", args: [myAddress] },
        { name: "Router", key: "router", args: ["${factory.address}", "${weth.address}"] },
      ],
      { signer }
    );

    const txSigner = new NonceManager(signer.signer.connect(signer.provider));
    const tokenATx = createErc20({ tokenName: "TestCoin", address: tokenAInfo.address, signer: txSigner });
    const tokenBTx = createErc20({ tokenName: "USDT", address: tokenBInfo.address, signer: txSigner });

    const factoryAddress = deployed.factory.address;
    const factoryAbi = loadArtifact("UniFactory")?.abi;
    const pairAbi = loadArtifact("MockUniswapV2FactoryUniswapV2Pair")?.abi;
    assert(Array.isArray(factoryAbi) && factoryAbi.length > 0, "UniFactory ABI 不可用");
    assert(Array.isArray(pairAbi) && pairAbi.length > 0, "Pair ABI 不可用");

    const factory = new Contract(factoryAddress, factoryAbi, txSigner);
    const createPairTx = await factory.createPair(tokenAInfo.address, tokenBInfo.address);
    await createPairTx.wait();

    const pairAddress = await factory.getPair(tokenAInfo.address, tokenBInfo.address);
    const pair = new Contract(pairAddress, pairAbi, txSigner);
    const pairAddr = pair.target;

    const amountA = 100n * 10n ** 18n;
    const amountB = 100n * 10n ** 18n;

    let tx = await tokenATx.transfer(pairAddr, amountA);
    await tx.wait();

    tx = await tokenBTx.transfer(pairAddr, amountB);
    await tx.wait();

    tx = await pair.mint(myAddress);
    await tx.wait();

    const beforeB = await tokenBTx.balanceOf(myAddress);
    const [reserve0, reserve1] = await pair.getReserves();
    const token0 = await pair.token0();
    const token0IsA = token0.toLowerCase() === tokenAInfo.address.toLowerCase();
    const reserveIn = token0IsA ? reserve0 : reserve1;
    const reserveOut = token0IsA ? reserve1 : reserve0;

    const swapIn = 10n * 10n ** 18n;
    const amountInWithFee = swapIn * 997n;
    const amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);

    tx = await tokenATx.transfer(pairAddr, swapIn);
    await tx.wait();

    const amount0Out = token0IsA ? 0n : amountOut;
    const amount1Out = token0IsA ? amountOut : 0n;
    tx = await pair.swap(amount0Out, amount1Out, myAddress, "0x");
    await tx.wait();

    const afterB = await tokenBTx.balanceOf(myAddress);
    assert(afterB > beforeB, "swap 后 TokenB 应增加");
  });
});
