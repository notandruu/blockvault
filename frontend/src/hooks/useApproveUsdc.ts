"use client";

import { useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAccount } from "wagmi";
import { ERC20_ABI, FACTORY_ADDRESS, USDC_ADDRESS } from "@/config/contracts";

export function useApproveUsdc(amount: bigint) {
  const { address } = useAccount();
  const chainId = useChainId();
  const factoryAddress = FACTORY_ADDRESS[chainId];
  const usdcAddress = USDC_ADDRESS[chainId];

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && factoryAddress ? [address, factoryAddress] : undefined,
    query: { enabled: !!address && !!factoryAddress },
  });

  const { writeContract, data: approveTxHash, isPending: isApproving } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isApproved } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  const approve = () => {
    if (!factoryAddress || !usdcAddress) return;
    writeContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [factoryAddress, amount],
    });
  };

  const needsApproval = allowance !== undefined && allowance < amount;

  return {
    allowance,
    needsApproval,
    approve,
    isApproving: isApproving || isConfirming,
    isApproved,
    approveTxHash,
    refetchAllowance,
  };
}
