"use client";

import { type Address } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useEscrowInfo } from "@/hooks/useEscrowInfo";
import { YieldDisplay } from "./YieldDisplay";
import { TransactionStatus } from "./TransactionStatus";
import {
  YIELD_ESCROW_ABI,
  CONDITION_LABELS,
  STATE_LABELS,
} from "@/config/contracts";
import {
  formatUSDC,
  formatAddress,
  formatTimestamp,
  formatYieldSplit,
  isZeroAddress,
} from "@/lib/format";

interface Props {
  escrowAddress: Address;
}

const STATE_BADGE: Record<number, string> = {
  0: "bg-blue-50 text-blue-700 border-blue-200",
  1: "bg-green-50 text-green-700 border-green-200",
  2: "bg-gray-50 text-gray-600 border-gray-200",
};

export function EscrowDetail({ escrowAddress }: Props) {
  const { address } = useAccount();
  const { escrowInfo, isLoading, isError } = useEscrowInfo(escrowAddress);

  const {
    writeContract: writeRelease,
    data: releaseTxHash,
    isPending: isReleasePending,
    error: releaseError,
  } = useWriteContract();

  const {
    writeContract: writeRefund,
    data: refundTxHash,
    isPending: isRefundPending,
    error: refundError,
  } = useWriteContract();

  const { isLoading: isReleaseConfirming, isSuccess: isReleaseSuccess } =
    useWaitForTransactionReceipt({ hash: releaseTxHash });

  const { isLoading: isRefundConfirming, isSuccess: isRefundSuccess } =
    useWaitForTransactionReceipt({ hash: refundTxHash });

  const callRelease = () =>
    writeRelease({ address: escrowAddress, abi: YIELD_ESCROW_ABI, functionName: "release" });

  const callRefund = () =>
    writeRefund({ address: escrowAddress, abi: YIELD_ESCROW_ABI, functionName: "refund" });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !escrowInfo) {
    return (
      <p className="text-red-500 text-sm">Failed to load escrow state.</p>
    );
  }

  const info = escrowInfo;
  const isSender = address?.toLowerCase() === info.sender.toLowerCase();
  const isRecipient = address?.toLowerCase() === info.recipient.toLowerCase();
  const isActive = info.state === 0;
  const conditionMet = isActive && info.conditionMetTimestamp > 0n;
  const gracePassed =
    conditionMet &&
    BigInt(Math.floor(Date.now() / 1000)) >= info.conditionMetTimestamp + BigInt(7 * 86400);
  const deadlinePassed =
    info.deadline > 0n &&
    BigInt(Math.floor(Date.now() / 1000)) >= info.deadline + BigInt(7 * 86400);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400 font-mono">{escrowAddress}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {isSender ? "You sent this escrow" : isRecipient ? "You are the recipient" : ""}
          </p>
        </div>
        <span className={`text-sm font-medium px-3 py-1 rounded-full border ${STATE_BADGE[info.state]}`}>
          {STATE_LABELS[info.state]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Principal</p>
          <p className="text-2xl font-semibold text-gray-900">
            ${formatUSDC(info.amount)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">USDC deposited</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">
            {isActive ? "Yield accrued" : "Total yield earned"}
          </p>
          <p className="text-2xl font-semibold text-green-600">
            {isActive ? (
              <YieldDisplay escrowAddress={escrowAddress} />
            ) : (
              `$${formatUSDC(info.totalValue > info.amount ? info.totalValue - info.amount : 0n)}`
            )}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">via Aave V3</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        <Row label="Sender" value={formatAddress(info.sender)} mono />
        <Row label="Recipient" value={formatAddress(info.recipient)} mono />
        <Row label="Condition" value={CONDITION_LABELS[info.conditionType]} />
        {info.releaseTimestamp > 0n && (
          <Row label="Release time" value={formatTimestamp(info.releaseTimestamp)} />
        )}
        {!isZeroAddress(info.conditionTarget) && (
          <Row label="Oracle" value={formatAddress(info.conditionTarget)} mono />
        )}
        <Row label="Yield split" value={formatYieldSplit(info.senderYieldBps)} />
        {info.deadline > 0n && (
          <Row label="Deadline" value={formatTimestamp(info.deadline)} />
        )}
        <Row
          label="Condition met"
          value={info.conditionMetTimestamp > 0n ? formatTimestamp(info.conditionMetTimestamp) : "Not yet"}
        />
      </div>

      {isActive && (
        <div className="space-y-3">
          {isRecipient && gracePassed && (
            <button
              onClick={callRelease}
              disabled={isReleasePending || isReleaseConfirming}
              className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isReleasePending || isReleaseConfirming ? "Releasing…" : "Claim release (grace period passed)"}
            </button>
          )}

          {isSender && deadlinePassed && (
            <button
              onClick={callRefund}
              disabled={isRefundPending || isRefundConfirming}
              className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isRefundPending || isRefundConfirming ? "Refunding…" : "Claim refund (deadline + grace passed)"}
            </button>
          )}

          {!gracePassed && !deadlinePassed && (
            <p className="text-xs text-gray-400 text-center">
              Waiting for backend to process release or refund.
            </p>
          )}
        </div>
      )}

      <TransactionStatus
        hash={releaseTxHash}
        isSubmitting={isReleasePending}
        isConfirming={isReleaseConfirming}
        isSuccess={isReleaseSuccess}
        error={releaseError}
        label="Release"
      />
      <TransactionStatus
        hash={refundTxHash}
        isSubmitting={isRefundPending}
        isConfirming={isRefundConfirming}
        isSuccess={isRefundSuccess}
        error={refundError}
        label="Refund"
      />
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center px-4 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
