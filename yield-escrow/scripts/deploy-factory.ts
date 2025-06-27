import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// Protocol addresses per chain
const ADDRESSES: Record<number, { pool: string; usdc: string; aUsdc: string }> = {
  // Base mainnet
  8453: {
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    aUsdc: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
  },
  // Base Sepolia — update with actual Aave V3 Sepolia addresses
  84532: {
    pool: process.env.BASE_SEPOLIA_AAVE_POOL || "",
    usdc: process.env.BASE_SEPOLIA_USDC || "",
    aUsdc: process.env.BASE_SEPOLIA_A_USDC || "",
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(`Deploying to chain ${chainId} with deployer ${deployer.address}`);

  const addrs = ADDRESSES[chainId];
  if (!addrs || !addrs.pool) {
    throw new Error(`No address config for chain ${chainId}`);
  }

  const backendCallerAddress = process.env.BACKEND_CALLER_ADDRESS;
  if (!backendCallerAddress) {
    throw new Error("BACKEND_CALLER_ADDRESS not set in .env");
  }

  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const factory = await EscrowFactory.deploy(
    addrs.pool,
    addrs.usdc,
    addrs.aUsdc,
    backendCallerAddress
  );
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log(`EscrowFactory deployed: ${factoryAddress}`);
  console.log(`\nVerify with:`);
  console.log(
    `npx hardhat verify --network ${network.name} ${factoryAddress} "${addrs.pool}" "${addrs.usdc}" "${addrs.aUsdc}" "${backendCallerAddress}"`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
