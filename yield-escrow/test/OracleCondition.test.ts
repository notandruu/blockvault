import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployOracleConditionAbove, deployOracleConditionBelow, deployFactoryWithTimedEscrow, createEscrow } from "./helpers/fixtures";
import {
  CHAINLINK_ETH_USD,
  STALENESS_THRESHOLD,
  ETH_THRESHOLD_4000,
  HUNDRED_USDC,
} from "./helpers/constants";
import { increaseTime, blockTimestamp } from "./helpers/utils";

describe("OracleCondition", () => {
  // ─── ABOVE direction ──────────────────────────────────────────────────────

  it("should return true when ETH/USD price is above threshold (ABOVE direction)", async () => {
    // Chainlink ETH/USD on Base mainnet is ~$3000–$4000+. Deploy with a low threshold.
    const { oracle } = await loadFixture(deployOracleConditionAbove);

    const OracleCondition = await ethers.getContractFactory("OracleCondition");
    const lowThreshold = BigInt(100) * BigInt(10 ** 8); // $100 — ETH is always above this
    const lowOracle = await OracleCondition.deploy(
      CHAINLINK_ETH_USD,
      lowThreshold,
      0, // ABOVE
      STALENESS_THRESHOLD
    );

    expect(await lowOracle.conditionMet()).to.be.true;
  });

  it("should return false when ETH/USD price is below threshold (ABOVE direction)", async () => {
    const OracleCondition = await ethers.getContractFactory("OracleCondition");
    const highThreshold = BigInt(1_000_000) * BigInt(10 ** 8); // $1,000,000 — ETH never reaches this
    const highOracle = await OracleCondition.deploy(
      CHAINLINK_ETH_USD,
      highThreshold,
      0, // ABOVE
      STALENESS_THRESHOLD
    );

    expect(await highOracle.conditionMet()).to.be.false;
  });

  // ─── BELOW direction ──────────────────────────────────────────────────────

  it("should return true when ETH/USD price is below threshold (BELOW direction)", async () => {
    const OracleCondition = await ethers.getContractFactory("OracleCondition");
    const highThreshold = BigInt(1_000_000) * BigInt(10 ** 8); // $1M — price is always below
    const oracle = await OracleCondition.deploy(
      CHAINLINK_ETH_USD,
      highThreshold,
      1, // BELOW
      STALENESS_THRESHOLD
    );

    expect(await oracle.conditionMet()).to.be.true;
  });

  it("should return false when ETH/USD price is above threshold (BELOW direction)", async () => {
    const OracleCondition = await ethers.getContractFactory("OracleCondition");
    const lowThreshold = BigInt(100) * BigInt(10 ** 8); // $100 — ETH is always above
    const oracle = await OracleCondition.deploy(
      CHAINLINK_ETH_USD,
      lowThreshold,
      1, // BELOW
      STALENESS_THRESHOLD
    );

    expect(await oracle.conditionMet()).to.be.false;
  });

  // ─── Staleness ────────────────────────────────────────────────────────────

  it("should return false (not revert) when oracle data is stale", async () => {
    const { oracle } = await loadFixture(deployOracleConditionAbove);

    // Get current oracle updatedAt
    const [, updatedAt] = await oracle.getLatestPrice();

    // Advance time far past the staleness threshold
    const currentTime = await blockTimestamp();
    const elapsed = currentTime - Number(updatedAt);
    const jumpNeeded = STALENESS_THRESHOLD + elapsed + 100;
    await increaseTime(jumpNeeded);

    // Should return false (not revert) to prevent false triggering
    expect(await oracle.conditionMet()).to.be.false;
  });

  // ─── Integration: oracle condition in escrow ──────────────────────────────

  it("should integrate with YieldEscrow for oracle-based release", async () => {
    const { factory, alice, bob, backendEOA, usdc } =
      await loadFixture(deployFactoryWithTimedEscrow);

    // Deploy oracle with low threshold so condition is immediately met
    const OracleCondition = await ethers.getContractFactory("OracleCondition");
    const lowThreshold = BigInt(100) * BigInt(10 ** 8);
    const oracle = await OracleCondition.deploy(
      CHAINLINK_ETH_USD,
      lowThreshold,
      0, // ABOVE — always true
      STALENESS_THRESHOLD
    );

    // Create oracle-type escrow
    const amount = HUNDRED_USDC;
    const oracleEscrow = await createEscrow({
      factory,
      senderSigner: alice,
      recipient: bob.address,
      amount,
      conditionType: 2, // ORACLE
      conditionTarget: await oracle.getAddress(),
    });

    expect(await oracleEscrow.isConditionMet()).to.be.true;

    const bobBalanceBefore = await usdc.balanceOf(bob.address);
    await oracleEscrow.connect(backendEOA).release();
    const bobBalanceAfter = await usdc.balanceOf(bob.address);

    expect(bobBalanceAfter).to.be.gt(bobBalanceBefore);
  });
});
