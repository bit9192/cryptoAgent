import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ContractFactory, JsonRpcProvider, NonceManager, Wallet, parseEther } from "ethers";
import { importAddress } from "../../../../../src/index.mjs";

export const FORK_RPC = "http://127.0.0.1:8545";
export const FUNDED_ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

export function loadArtifact(name) {
  const baseDir = new URL(".", import.meta.url).pathname;
  const artifactDirs = [
    "../../../../../artifacts/contracts/src/mocks/TestCoin.sol",
    "../../../../../artifacts/contracts/src/mocks/MockUniswapV2Factory.sol",
    "../../../../../artifacts/contracts/src/mocks/MockUniswapV2Router02.sol",
    "../../../../../artifacts/contracts/src/mocks/SwapV3.sol",
    "../../../../../artifacts/contracts/src/mocks/WETH.sol",
    "../../../../../../artifacts/contracts/src/mocks/TestCoin.sol",
    "../../../../../../contracts/artifacts/mocks/TestCoin",
  ];
  const paths = [
    ...artifactDirs.map((dir) => resolve(baseDir, dir, `${name}.json`)),
    resolve(baseDir, "../../../../../artifacts/contracts/src/mocks", `${name}.sol`, `${name}.json`),
  ];

  for (const artifactPath of paths) {
    try {
      const content = readFileSync(artifactPath, "utf8");
      return JSON.parse(content);
    } catch {
      // keep trying fallback paths
    }
  }

  return null;
}

export async function setupForkDeployer(transferEth = "10") {
  const provider = new JsonRpcProvider(FORK_RPC);
  // 使用随机钱包避免测试间 nonce 互相影响
  const wallet = Wallet.createRandom().connect(provider);
  const signer = new NonceManager(wallet);
  const myAddress = await signer.getAddress();

  const richSigner = await importAddress(FUNDED_ADDRESS);
  const tx = await richSigner.sendTransaction({
    to: myAddress,
    value: parseEther(transferEth),
  });
  await tx.wait();

  return { provider, signer, richSigner, myAddress };
}

export async function deployMockToken(name, symbol, signer) {
  const artifact = loadArtifact(name);
  if (!artifact?.bytecode) {
    throw new Error(`无法加载 ${name} artifact`);
  }

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const deployTx = name === "USDT" ? await factory.deploy() : await factory.deploy(name, symbol);
  const contract = await deployTx.waitForDeployment();
  const address = await contract.getAddress();

  return { contract, address };
}
