"use client";

import { useReadContract, useBlockNumber } from "wagmi";
import { type Address } from "viem";
import { useEffect } from "react";
import { YIELD_ESCROW_ABI } from "@/config/contracts";

export function useCurrentYield(escrowAddress: Address | undefined) {
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data: yield_, refetch } = useReadContract({
    address: escrowAddress,
    abi: YIELD_ESCROW_ABI,
    functionName: "getCurrentYield",
    query: { enabled: !!escrowAddress },
  });

  useEffect(() => {
    if (blockNumber) refetch();
  }, [blockNumber, refetch]);

  return { currentYield: (yield_ as bigint | undefined) ?? 0n };
}
