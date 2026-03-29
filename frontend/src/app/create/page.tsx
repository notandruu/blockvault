"use client";

import { useAccount } from "wagmi";
import { CreateEscrowForm } from "@/components/CreateEscrowForm";

export default function CreatePage() {
  const { isConnected } = useAccount();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New escrow</h1>
        <p className="text-sm text-gray-400 mt-1">
          USDC deposits into Aave V3 immediately and earns yield until the condition is met.
        </p>
      </div>

      {isConnected ? (
        <CreateEscrowForm />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-16 text-center">
          <p className="text-gray-400 text-sm">Connect your wallet to create an escrow.</p>
        </div>
      )}
    </div>
  );
}
