import { ethers } from "hardhat";
import {
  EscrowFactory,
  YieldEscrow,
  OracleCondition,
} from "../../typechain-types";
import {
  USDC,
  AAVE_POOL,
  A_USDC,
  CHAINLINK_ETH_USD,
  USDC_WHALE,
  HUNDRED_USDC,
  STALENESS_THRESHOLD,
  ETH_THRESHOLD_4000,
} from "./constants";
import { dealToken, impersonate, blockTimestamp } from "./utils";

// ─── Shared fixture: deploy factory ──────────────────────────────────────────

export async function deployFactory() {
  const [deployer, backendEOA, alice, bob, charlie] =
    await ethers.getSigners();

  await dealToken(USDC, USDC_WHALE, alice.address, HUNDRED_USDC * BigInt(10));
  await dealToken(USDC, USDC_WHALE, bob.address, HUNDRED_USDC * BigInt(10));

  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const factory = (await EscrowFactory.deploy(
    AAVE_POOL,
    USDC,
    A_USDC,
    backendEOA.address
  )) as EscrowFactory;

  const usdc = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    USDC
  );

  return { factory, usdc, deployer, backendEOA, alice, bob, charlie };
}

// ─── Shared fixture: deploy oracle condition ──────────────────────────────────

export async function deployOracleConditionAbove() {
  const signers = await ethers.getSigners();
  const OracleCondition = await ethers.getContractFactory("OracleCondition");
  const oracle = (await OracleCondition.deploy(
    CHAINLINK_ETH_USD,
    ETH_THRESHOLD_4000,
    0, // Direction.ABOVE
    STALENESS_THRESHOLD
  )) as OracleCondition;
  return { oracle, signers };
}

export async function deployOracleConditionBelow() {
  const signers = await ethers.getSigners();
  const OracleCondition = await ethers.getContractFactory("OracleCondition");
  const oracle = (await OracleCondition.deploy(
    CHAINLINK_ETH_USD,
    ETH_THRESHOLD_4000,
    1, // Direction.BELOW
    STALENESS_THRESHOLD
  )) as OracleCondition;
  return { oracle, signers };
}

// ─── Create escrow helpers ────────────────────────────────────────────────────

export interface CreateEscrowParams {
  factory: EscrowFactory;
  senderSigner: Awaited<ReturnType<typeof ethers.getSigner>>;
  recipient: string;
  amount: bigint;
  conditionType: 0 | 1 | 2; // TIME_BASED | MANUAL_APPROVAL | ORACLE
  conditionTarget?: string;
  releaseTimestamp?: number;
  deadline?: number;
  senderYieldBps?: number;
}

export async function createEscrow(
  params: CreateEscrowParams
): Promise<YieldEscrow> {
  const {
    factory,
    senderSigner,
    recipient,
    amount,
    conditionType,
    conditionTarget = ethers.ZeroAddress,
    releaseTimestamp = 0,
    deadline = 0,
    senderYieldBps = 5000,
  } = params;

  const usdc = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    USDC,
    senderSigner
  );
  await usdc.approve(await factory.getAddress(), amount);

  const tx = await factory
    .connect(senderSigner)
    .createEscrow(
      recipient,
      amount,
      conditionType,
      conditionTarget,
      releaseTimestamp,
      deadline,
      senderYieldBps
    );
  const receipt = await tx.wait();

  const factoryInterface = factory.interface;
  let escrowAddress = "";
  for (const log of receipt!.logs) {
    try {
      const parsed = factoryInterface.parseLog(log);
      if (parsed?.name === "EscrowCreated") {
        escrowAddress = parsed.args.escrow;
        break;
      }
    } catch {}
  }

  if (!escrowAddress) throw new Error("EscrowCreated event not found");

  return ethers.getContractAt("YieldEscrow", escrowAddress) as Promise<YieldEscrow>;
}

// ─── Full fixture: factory + time-based escrow ────────────────────────────────

export async function deployFactoryWithTimedEscrow() {
  const base = await deployFactory();
  const now = await blockTimestamp();
  const releaseTs = now + 86400 * 30; // 30 days from now
  const deadlineTs = now + 86400 * 60; // 60 days

  const escrow = await createEscrow({
    factory: base.factory,
    senderSigner: base.alice,
    recipient: base.bob.address,
    amount: HUNDRED_USDC,
    conditionType: 0, // TIME_BASED
    releaseTimestamp: releaseTs,
    deadline: deadlineTs,
    senderYieldBps: 5000,
  });

  return { ...base, escrow, releaseTs, deadlineTs };
}

// ─── Full fixture: factory + manual approval escrow ──────────────────────────

export async function deployFactoryWithManualEscrow() {
  const base = await deployFactory();
  const now = await blockTimestamp();
  const deadlineTs = now + 86400 * 60;

  const escrow = await createEscrow({
    factory: base.factory,
    senderSigner: base.alice,
    recipient: base.bob.address,
    amount: HUNDRED_USDC,
    conditionType: 1, // MANUAL_APPROVAL
    deadline: deadlineTs,
    senderYieldBps: 5000,
  });

  return { ...base, escrow, deadlineTs };
}
