"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Dithering } from "@paper-design/shaders-react";
import { EscrowList } from "@/components/EscrowList";
import { ConnectWallet } from "@/components/ConnectWallet";

export default function DashboardPage() {
  const { isConnected } = useAccount();

  return (
    <div className="flex" style={{ height: "calc(100vh - 3.5rem)" }}>
      <div className="w-1/2 overflow-y-auto p-8 bg-white space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Your escrows</h1>
            <p className="text-sm text-gray-400 mt-1">
              USDC held in Aave V3, earning yield while conditions are met.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ConnectWallet />
            <Link
              href="/create"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              New escrow
            </Link>
          </div>
        </div>

        {isConnected ? (
          <EscrowList />
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-gray-400 text-sm">Connect your wallet to see your escrows.</p>
          </div>
        )}
      </div>

      <div className="w-1/2 relative">
        <Dithering
          style={{ height: "100%", width: "100%" }}
          colorBack="hsl(20, 90%, 78%)"
          colorFront="hsl(348, 80%, 62%)"
          shape="simplex"
          type="4x4"
          size={3}
          offsetX={0}
          offsetY={0}
          scale={0.8}
          rotation={0}
          speed={0.1}
        />
      </div>
    </div>
  );
}
