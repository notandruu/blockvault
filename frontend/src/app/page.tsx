"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { EscrowList } from "@/components/EscrowList";

export default function HomePage() {
  const { isConnected } = useAccount();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Your escrows</h1>
          <p className="text-sm text-gray-400 mt-1">USDC held in Aave V3, earning yield while conditions are met.</p>
        </div>
        <Link
          href="/create"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          New escrow
        </Link>
      </div>

      {isConnected ? (
        <EscrowList />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-16 text-center">
          <p className="text-gray-400 text-sm">Connect your wallet to see your escrows.</p>
        </div>
      )}
    </div>
  );
}
