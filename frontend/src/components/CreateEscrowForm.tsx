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

const CONDITIONS = [
  {
    type: 0 as ConditionType,
    label: "Time-based",
    description: "Releases after a set date",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    type: 1 as ConditionType,
    label: "Manual approval",
    description: "You approve the release",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
      </svg>
    ),
  },
  {
    type: 2 as ConditionType,
    label: "Oracle",
    description: "Chainlink price threshold",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
] as const;

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

  const { data: usdcBalance } = useBalance({ address, token: usdcAddress });

  const { needsApproval, approve, isApproving, isApproved, approveTxHash, refetchAllowance } =
    useApproveUsdc(amount);

  const { createEscrow, txHash, isSubmitting, isConfirming, isSuccess, newEscrowAddress, error } =
    useCreateEscrow();

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
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div className="space-y-1.5">
        <label htmlFor="recipient" className="block text-sm font-medium text-gray-700">
          Recipient address
        </label>
        <input
          id="recipient"
          type="text"
          placeholder="0x…"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm font-mono text-gray-900 placeholder-gray-400 bg-gray-50 focus:bg-white focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-colors cursor-text"
          required
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
            Amount
          </label>
          {usdcBalance && (
            <button
              type="button"
              onClick={() => setAmountStr(formatUSDC(usdcBalance.value))}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
            >
              Balance: ${formatUSDC(usdcBalance.value)} · <span className="underline underline-offset-2">Max</span>
            </button>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">$</span>
          <input
            id="amount"
            type="number"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full h-11 rounded-lg border border-gray-200 pl-7 pr-12 text-sm text-gray-900 placeholder-gray-400 bg-gray-50 focus:bg-white focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-colors cursor-text"
            required
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">USDC</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Release condition
        </label>
        <div className="grid grid-cols-3 gap-2">
          {CONDITIONS.map(({ type, label, description, icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => setConditionType(type)}
              className={`relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                conditionType === type
                  ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-white"
              }`}
            >
              <span className={conditionType === type ? "text-white" : "text-gray-500"}>
                {icon}
              </span>
              <span className="text-xs font-semibold leading-tight">{label}</span>
              <span className={`text-[10px] leading-tight ${conditionType === type ? "text-gray-300" : "text-gray-400"}`}>
                {description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {conditionType === 0 && (
        <div className="space-y-1.5">
          <label htmlFor="releaseDate" className="block text-sm font-medium text-gray-700">
            Release date & time <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            <input
              id="releaseDate"
              type="datetime-local"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              className="w-full h-11 rounded-lg border border-gray-200 pl-9 pr-3 text-sm text-gray-900 bg-gray-50 focus:bg-white focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-colors cursor-pointer [color-scheme:light]"
              required={conditionType === 0}
            />
          </div>
        </div>
      )}

      {conditionType === 2 && (
        <div className="space-y-1.5">
          <label htmlFor="oracle" className="block text-sm font-medium text-gray-700">
            Oracle contract address <span className="text-red-400">*</span>
          </label>
          <input
            id="oracle"
            type="text"
            placeholder="0x…"
            value={conditionTarget}
            onChange={(e) => setConditionTarget(e.target.value)}
            className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm font-mono text-gray-900 placeholder-gray-400 bg-gray-50 focus:bg-white focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-colors cursor-text"
            required={conditionType === 2}
          />
          <p className="text-xs text-gray-400">
            Deploy an OracleCondition contract first and paste its address here.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Yield split
          </label>
          <div className="text-sm">
            <span className="font-semibold text-gray-900">{100 - senderYieldPct}%</span>
            <span className="text-gray-400"> to recipient · </span>
            <span className="font-semibold text-gray-900">{senderYieldPct}%</span>
            <span className="text-gray-400"> to you</span>
          </div>
        </div>
        <div className="px-0.5">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={100 - senderYieldPct}
            onChange={(e) => setSenderYieldPct(100 - Number(e.target.value))}
            className="w-full h-1.5 accent-gray-900 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="deadline" className="block text-sm font-medium text-gray-700">
          Auto-refund deadline{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <input
            id="deadline"
            type="datetime-local"
            value={deadlineDate}
            onChange={(e) => setDeadlineDate(e.target.value)}
            className="w-full h-11 rounded-lg border border-gray-200 pl-9 pr-3 text-sm text-gray-900 bg-gray-50 focus:bg-white focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-colors cursor-pointer [color-scheme:light]"
          />
        </div>
        <p className="text-xs text-gray-400">
          If the condition is unmet by this date, USDC + yield is returned to you.
        </p>
      </div>

      <div className="flex gap-2 pt-1">
        {isReady && needsApproval && !isApproved && (
          <button
            type="button"
            onClick={approve}
            disabled={isApproving}
            className="flex-1 h-11 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isApproving ? "Approving…" : "1. Approve USDC"}
          </button>
        )}

        {showCreateButton && (
          <button
            type="submit"
            disabled={isSubmitting || isConfirming || !isReady}
            className="flex-1 h-11 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
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
