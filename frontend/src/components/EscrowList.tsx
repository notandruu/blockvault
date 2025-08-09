"use client";

import { useEscrowList } from "@/hooks/useEscrowList";
import { EscrowCard } from "./EscrowCard";

export function EscrowList() {
  const { escrows, isLoading, totalCount } = useEscrowList();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-48 rounded-xl border border-gray-100 bg-gray-50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (escrows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center">
        <p className="text-gray-400 text-sm">No escrows yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {escrows.map((e) => (
        <EscrowCard key={e.address} address={e.address} info={e.info} />
      ))}
    </div>
  );
}
