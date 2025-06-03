import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const ALCHEMY_BASE_MAINNET_RPC = process.env.ALCHEMY_BASE_MAINNET_RPC || "";
const ALCHEMY_BASE_SEPOLIA_RPC = process.env.ALCHEMY_BASE_SEPOLIA_RPC || "";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";
const FORK_BLOCK_NUMBER = process.env.FORK_BLOCK_NUMBER
  ? parseInt(process.env.FORK_BLOCK_NUMBER)
  : undefined;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: ALCHEMY_BASE_MAINNET_RPC,
        blockNumber: FORK_BLOCK_NUMBER,
        enabled: !!ALCHEMY_BASE_MAINNET_RPC,
      },
      chainId: 8453,
    },
    baseSepolia: {
      url: ALCHEMY_BASE_SEPOLIA_RPC,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 84532,
    },
    base: {
      url: ALCHEMY_BASE_MAINNET_RPC,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: {
      base: BASESCAN_API_KEY,
      baseSepolia: BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
