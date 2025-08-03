"use client";

import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";
import { type Address } from "viem";
import { ESCROW_FACTORY_ABI, FACTORY_ADDRESS, YIELD_ESCROW_ABI, parseEscrowInfo, type EscrowInfo } from "@/config/contracts";

export interface EscrowWithAddress {
  address: Address;
  info: EscrowInfo;
}

export function useEscrowList() {
  const { address } = useAccount();
  const chainId = useChainId();
  const factoryAddress = FACTORY_ADDRESS[chainId];

  const { data: escrowAddresses, isLoading: isLoadingAddresses } = useReadContract({
    address: factoryAddress,
    abi: ESCROW_FACTORY_ABI,
    functionName: "getEscrowsByAddress",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!factoryAddress },
  });

  const addresses = (escrowAddresses as Address[] | undefined) ?? [];

  const { data: escrowInfos, isLoading: isLoadingInfos } = useReadContracts({
    contracts: addresses.map((addr) => ({
      address: addr,
      abi: YIELD_ESCROW_ABI,
      functionName: "getEscrowInfo" as const,
    })),
    query: { enabled: addresses.length > 0 },
  });

  const escrows: EscrowWithAddress[] = [];
  if (escrowInfos) {
    for (let i = 0; i < addresses.length; i++) {
      const result = escrowInfos[i];
      if (result?.status === "success" && result.result) {
        escrows.push({
          address: addresses[i],
          info: parseEscrowInfo(result.result as readonly unknown[]),
        });
      }
    }
  }

  return {
    escrows,
    isLoading: isLoadingAddresses || isLoadingInfos,
    totalCount: addresses.length,
  };
}
