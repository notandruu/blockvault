import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployFactory,
  createEscrow,
  deployFactoryWithTimedEscrow,
} from "./helpers/fixtures";
import { AAVE_POOL, USDC, A_USDC, HUNDRED_USDC } from "./helpers/constants";
import { blockTimestamp } from "./helpers/utils";

describe("EscrowFactory", () => {
  // ─── Deployment ─────────────────────────────────────────────────────────────

  it("should deploy factory with correct immutable addresses", async () => {
    const { factory } = await loadFixture(deployFactory);
    expect(await factory.pool()).to.equal(AAVE_POOL);
    expect(await factory.usdc()).to.equal(USDC);
    expect(await factory.aUsdc()).to.equal(A_USDC);
  });

  // ─── createEscrow ────────────────────────────────────────────────────────────

  it("should create escrow and emit EscrowCreated with all params", async () => {
    const { factory, alice, bob, backendEOA, usdc } =
      await loadFixture(deployFactory);

    const amount = HUNDRED_USDC;
    const now = await blockTimestamp();
    const releaseTs = now + 86400;
    const deadlineTs = now + 86400 * 30;
    const senderYieldBps = 3000;

    await usdc.connect(alice).approve(await factory.getAddress(), amount);
    const tx = await factory
      .connect(alice)
      .createEscrow(
        bob.address,
        amount,
        0, // TIME_BASED
        ethers.ZeroAddress,
        releaseTs,
        deadlineTs,
        senderYieldBps
      );

    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "EscrowCreated");

    expect(event).to.not.be.null;
    expect(event!.args.sender).to.equal(alice.address);
    expect(event!.args.recipient).to.equal(bob.address);
    expect(event!.args.amount).to.equal(amount);
    expect(event!.args.conditionType).to.equal(0);
    expect(event!.args.senderYieldBps).to.equal(senderYieldBps);
    expect(event!.args.deadline).to.equal(deadlineTs);
    expect(event!.args.releaseTimestamp).to.equal(releaseTs);
  });

  it("should register escrow in sender and recipient mappings", async () => {
    const { factory, alice, bob, usdc } = await loadFixture(deployFactory);
    const amount = HUNDRED_USDC;
    await usdc.connect(alice).approve(await factory.getAddress(), amount);
    const tx = await factory
      .connect(alice)
      .createEscrow(bob.address, amount, 1, ethers.ZeroAddress, 0, 0, 5000);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "EscrowCreated");

    const escrowAddr = event!.args.escrow;
    const bySender = await factory.getEscrowsBySender(alice.address);
    const byRecipient = await factory.getEscrowsByRecipient(bob.address);

    expect(bySender).to.include(escrowAddr);
    expect(byRecipient).to.include(escrowAddr);
    expect(await factory.isEscrow(escrowAddr)).to.be.true;
  });

  it("should return all escrows for address that is both sender and recipient", async () => {
    const { factory, alice, bob, usdc } = await loadFixture(deployFactory);
    const amount = HUNDRED_USDC;

    await usdc.connect(alice).approve(await factory.getAddress(), amount * BigInt(2));

    await factory
      .connect(alice)
      .createEscrow(bob.address, amount, 1, ethers.ZeroAddress, 0, 0, 5000);
    await factory
      .connect(bob)
      .createEscrow(alice.address, amount, 1, ethers.ZeroAddress, 0, 0, 5000);

    const byAddress = await factory.getEscrowsByAddress(alice.address);
    expect(byAddress.length).to.equal(2);
  });

  it("should track escrow count correctly after multiple creations", async () => {
    const { factory, alice, bob, usdc } = await loadFixture(deployFactory);
    const amount = HUNDRED_USDC;

    await usdc.connect(alice).approve(await factory.getAddress(), amount * BigInt(3));

    await factory
      .connect(alice)
      .createEscrow(bob.address, amount, 1, ethers.ZeroAddress, 0, 0, 5000);
    await factory
      .connect(alice)
      .createEscrow(bob.address, amount, 1, ethers.ZeroAddress, 0, 0, 5000);
    await factory
      .connect(alice)
      .createEscrow(bob.address, amount, 1, ethers.ZeroAddress, 0, 0, 5000);

    expect(await factory.getEscrowCount()).to.equal(3);
    const first = await factory.getEscrowAtIndex(0);
    expect(await factory.isEscrow(first)).to.be.true;
  });

  // ─── Pause ───────────────────────────────────────────────────────────────────

  it("should revert createEscrow when factory is paused", async () => {
    const { factory, alice, bob, deployer, usdc } =
      await loadFixture(deployFactory);
    const amount = HUNDRED_USDC;

    await factory.connect(deployer).pause();
    await usdc.connect(alice).approve(await factory.getAddress(), amount);

    await expect(
      factory
        .connect(alice)
        .createEscrow(bob.address, amount, 1, ethers.ZeroAddress, 0, 0, 5000)
    ).to.be.revertedWithCustomError(factory, "EnforcedPause");
  });

  // ─── Input validation ────────────────────────────────────────────────────────

  it("should revert createEscrow with zero amount", async () => {
    const { factory, alice, bob } = await loadFixture(deployFactory);
    await expect(
      factory
        .connect(alice)
        .createEscrow(bob.address, 0, 1, ethers.ZeroAddress, 0, 0, 5000)
    ).to.be.revertedWith("EscrowFactory: zero amount");
  });

  it("should revert createEscrow with invalid senderYieldBps > 10000", async () => {
    const { factory, alice, bob } = await loadFixture(deployFactory);
    await expect(
      factory
        .connect(alice)
        .createEscrow(
          bob.address,
          HUNDRED_USDC,
          1,
          ethers.ZeroAddress,
          0,
          0,
          10001
        )
    ).to.be.revertedWith("EscrowFactory: invalid bps");
  });

  it("should revert createEscrow with zero recipient address", async () => {
    const { factory, alice } = await loadFixture(deployFactory);
    await expect(
      factory
        .connect(alice)
        .createEscrow(
          ethers.ZeroAddress,
          HUNDRED_USDC,
          1,
          ethers.ZeroAddress,
          0,
          0,
          5000
        )
    ).to.be.revertedWith("EscrowFactory: zero recipient");
  });
});
