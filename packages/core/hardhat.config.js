import { defineConfig } from "hardhat/config";

const forkUrl = String(process.env.FORK_URL ?? "").trim();
const forkBlockNumber = process.env.FORK_BLOCK_NUMBER
  ? Number.parseInt(process.env.FORK_BLOCK_NUMBER, 10)
  : undefined;

export default defineConfig({
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
      allowUnlimitedContractSize: true,
      ...(forkUrl
        ? {
            forking: {
              url: forkUrl,
              blockNumber: forkBlockNumber,
            },
          }
        : {}),
    },
  },
});
