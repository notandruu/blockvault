"use client";

import Link from "next/link";
import { type Address } from "viem";
import { useAccount } from "wagmi";
import { type EscrowInfo, CONDITION_LABELS, STATE_LABELS } from "@/config/contracts";
import { YieldDisplay } from "./YieldDisplay";
import { formatUSDC, formatAddress, formatTimestamp } from "@/lib/format";

interface Props {
  address: Address;
  info: EscrowInfo;
}

const STATE_COLORS: Record<number, string> = {
  0: "bg-blue-50 text-blue-700 border-blue-200",
  1: "bg-green-50 text-green-700 border-green-200",
  2: "bg-gray-50 text-gray-600 border-gray-200",
};

export function EscrowCard({ address, info }: Props) {
  const { address: connectedAddress } = useAccount();
  const isSender = connectedAddress?.toLowerCase() === info.sender.toLowerCase();
  const role = isSender ? "Sent" : "Received";

  return (
    <Link
      href={`/escrow/${address}`}
      className="block rounded-xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {role}
          </span>
          <p className="mt-0.5 font-mono text-sm text-gray-500">
            {formatAddress(address)}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATE_COLORS[info.state]}`}
        >
          {STATE_LABELS[info.state]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Principal</p>
          <p className="font-semibold text-gray-900">${formatUSDC(info.amount)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Yield earned</p>
          {info.state === 0 ? (
            <YieldDisplay escrowAddress={address} className="font-semibold text-green-600" />
          ) : (
            <p className="font-semibold text-gray-900">
              ${formatUSDC(info.totalValue - info.amount)}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Condition</p>
          <p className="text-sm text-gray-700">{CONDITION_LABELS[info.conditionType]}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">
            {info.deadline > 0n ? "Deadline" : "Release"}
          </p>
          <p className="text-sm text-gray-700">
            {info.deadline > 0n
              ? formatTimestamp(info.deadline)
              : info.releaseTimestamp > 0n
              ? formatTimestamp(info.releaseTimestamp)
              : "No deadline"}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
        <span>
          {isSender ? "→ " : "← "}
          {formatAddress(isSender ? info.recipient : info.sender)}
        </span>
        <span>
          {((10000 - info.senderYieldBps) / 100).toFixed(0)}% yield to recipient
        </span>
      </div>
    </Link>
  );
}
