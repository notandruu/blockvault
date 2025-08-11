"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, useBalance } from "wagmi";
import { type Address, parseUnits, zeroAddress } from "viem";
import { useApproveUsdc } from "@/hooks/useApproveUsdc";
import { useCreateEscrow, type CreateEscrowParams } from "@/hooks/useCreateEscrow";
import { TransactionStatus } from "./TransactionStatus";
import { formatUSDC } from "@/lib/format";
import { USDC_ADDRESS, type ConditionType } from "@/config/contracts";

export function CreateEscrowForm() {
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const usdcAddress = USDC_ADDRESS[chainId];

  const [recipient, setRecipient] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [conditionType, setConditionType] = useState<ConditionType>(1);
  const [releaseDate, setReleaseDate] = useState("");
  const [conditionTarget, setConditionTarget] = useState("");
  const [senderYieldPct, setSenderYieldPct] = useState(0);
  const [deadlineDate, setDeadlineDate] = useState("");

  const amount = amountStr ? parseUnits(amountStr, 6) : 0n;

  const { data: usdcBalance } = useBalance({
    address,
    token: usdcAddress,
  });

  const {
    needsApproval,
    approve,
    isApproving,
    isApproved,
    approveTxHash,
    refetchAllowance,
  } = useApproveUsdc(amount);

  const {
    createEscrow,
    txHash,
    isSubmitting,
    isConfirming,
    isSuccess,
    newEscrowAddress,
    error,
  } = useCreateEscrow();

  if (isSuccess && newEscrowAddress) {
    router.push(`/escrow/${newEscrowAddress}`);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || amount === 0n) return;

    await refetchAllowance();
    if (needsApproval) return;

    const params: CreateEscrowParams = {
      recipient: recipient as Address,
      amount,
      conditionType,
      conditionTarget: (conditionTarget || zeroAddress) as Address,
      releaseTimestamp: releaseDate
        ? BigInt(Math.floor(new Date(releaseDate).getTime() / 1000))
        : 0n,
      deadline: deadlineDate
        ? BigInt(Math.floor(new Date(deadlineDate).getTime() / 1000))
        : 0n,
      senderYieldBps: senderYieldPct * 100,
    };

    createEscrow(params);
  };

  const isReady = !!recipient && amount > 0n && !!address;
  const showCreateButton = isReady && (isApproved || !needsApproval);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Recipient address
        </label>
        <input
          type="text"
          placeholder="0x…"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Amount (USDC)
          {usdcBalance && (
            <span className="ml-2 text-gray-400 font-normal">
              Balance: ${formatUSDC(usdcBalance.value)}
            </span>
          )}
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
          <input
            type="number"
            placeholder="100"
            min="0"
            step="0.01"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Release condition
        </label>
        <div className="grid grid-cols-3 gap-2">
          {([
            [0, "Time-based"],
            [1, "Manual approval"],
            [2, "Oracle"],
          ] as const).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => setConditionType(type)}
              className={`rounded-lg border py-2 px-3 text-sm transition-colors ${
                conditionType === type
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {conditionType === 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Release date & time
          </label>
          <input
            type="datetime-local"
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            required={conditionType === 0}
          />
        </div>
      )}

      {conditionType === 2 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Oracle contract address (ICondition)
          </label>
          <input
            type="text"
            placeholder="0x…"
            value={conditionTarget}
            onChange={(e) => setConditionTarget(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            required={conditionType === 2}
          />
          <p className="mt-1 text-xs text-gray-400">
            Deploy an OracleCondition contract first and paste its address here.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Yield to recipient
          <span className="ml-2 font-semibold text-gray-900">
            {100 - senderYieldPct}%
          </span>
          <span className="text-gray-400 font-normal ml-1">
            ({senderYieldPct}% back to you)
          </span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={100 - senderYieldPct}
          onChange={(e) => setSenderYieldPct(100 - Number(e.target.value))}
          className="w-full accent-gray-900"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Auto-refund deadline{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          type="datetime-local"
          value={deadlineDate}
          onChange={(e) => setDeadlineDate(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        <p className="mt-1 text-xs text-gray-400">
          If the condition is not met by this date, USDC + yield is returned to you.
        </p>
      </div>

      <div className="flex gap-3">
        {isReady && needsApproval && !isApproved && (
          <button
            type="button"
            onClick={approve}
            disabled={isApproving}
            className="flex-1 rounded-lg bg-gray-100 border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {isApproving ? "Approving…" : "1. Approve USDC"}
          </button>
        )}

        {showCreateButton && (
          <button
            type="submit"
            disabled={isSubmitting || isConfirming || !isReady}
            className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting
              ? "Confirm in wallet…"
              : isConfirming
              ? "Creating…"
              : needsApproval
              ? "2. Create Escrow"
              : "Create Escrow"}
          </button>
        )}
      </div>

      {approveTxHash && (
        <TransactionStatus
          hash={approveTxHash}
          isSubmitting={false}
          isConfirming={isApproving}
          isSuccess={isApproved}
          error={null}
          label="USDC approval"
        />
      )}

      <TransactionStatus
        hash={txHash}
        isSubmitting={isSubmitting}
        isConfirming={isConfirming}
        isSuccess={isSuccess}
        error={error}
        label="Escrow creation"
      />
    </form>
  );
}
