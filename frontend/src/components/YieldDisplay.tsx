"use client";

import { type Address } from "viem";
import { useCurrentYield } from "@/hooks/useCurrentYield";
import { formatUSDC } from "@/lib/format";

interface Props {
  escrowAddress: Address;
  className?: string;
}

export function YieldDisplay({ escrowAddress, className = "" }: Props) {
  const { currentYield } = useCurrentYield(escrowAddress);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      ${formatUSDC(currentYield, 6)}
    </span>
  );
}
