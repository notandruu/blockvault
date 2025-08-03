"use client";

import { useReadContract, useBlockNumber } from "wagmi";
import { type Address } from "viem";
import { useEffect } from "react";
import { YIELD_ESCROW_ABI, parseEscrowInfo, type EscrowInfo } from "@/config/contracts";

export function useEscrowInfo(escrowAddress: Address | undefined) {
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data, isLoading, isError, refetch } = useReadContract({
    address: escrowAddress,
    abi: YIELD_ESCROW_ABI,
    functionName: "getEscrowInfo",
    query: { enabled: !!escrowAddress },
  });

  useEffect(() => {
    if (blockNumber) refetch();
  }, [blockNumber, refetch]);

  const escrowInfo: EscrowInfo | undefined = data
    ? parseEscrowInfo(data as readonly unknown[])
    : undefined;

  return { escrowInfo, isLoading, isError };
}
