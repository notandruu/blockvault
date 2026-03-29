"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { type Address } from "viem";
import { EscrowDetail } from "@/components/EscrowDetail";

export default function EscrowPage() {
  const { address } = useParams<{ address: string }>();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Escrow</h1>
      </div>

      <EscrowDetail escrowAddress={address as Address} />
    </div>
  );
}
