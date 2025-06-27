import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// Chainlink ETH/USD feed per chain
const ETH_USD_FEEDS: Record<number, string> = {
  8453: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",   // Base mainnet
  84532: process.env.BASE_SEPOLIA_ETH_USD_FEED || "",      // Base Sepolia
};

// Direction enum: 0 = ABOVE, 1 = BELOW
const DIRECTION_ABOVE = 0;
const DIRECTION_BELOW = 1;

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(`Deploying OracleCondition to chain ${chainId} with deployer ${deployer.address}`);

  const feed = ETH_USD_FEEDS[chainId];
  if (!feed) throw new Error(`No ETH/USD feed configured for chain ${chainId}`);

  // $4000 in Chainlink 8-decimal format
  const threshold = BigInt(4_000) * BigInt(10 ** 8);
  const direction = DIRECTION_ABOVE;
  const stalenessThreshold = 3600; // 1 hour

  const OracleCondition = await ethers.getContractFactory("OracleCondition");
  const oracle = await OracleCondition.deploy(
    feed,
    threshold,
    direction,
    stalenessThreshold
  );
  await oracle.waitForDeployment();

  const oracleAddress = await oracle.getAddress();
  console.log(`OracleCondition deployed: ${oracleAddress}`);
  console.log(`  feed:      ${feed}`);
  console.log(`  threshold: $${threshold / BigInt(10 ** 8)} (ABOVE)`);
  console.log(`  staleness: ${stalenessThreshold}s`);
  console.log(`\nVerify with:`);
  console.log(
    `npx hardhat verify --network ${network.name} ${oracleAddress} "${feed}" "${threshold}" ${direction} ${stalenessThreshold}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
