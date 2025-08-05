"use client";

import { useState } from "react";
import { useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address, parseEventLogs } from "viem";
import { ESCROW_FACTORY_ABI, FACTORY_ADDRESS, type ConditionType } from "@/config/contracts";

export interface CreateEscrowParams {
  recipient: Address;
  amount: bigint;
  conditionType: ConditionType;
  conditionTarget: Address;
  releaseTimestamp: bigint;
  deadline: bigint;
  senderYieldBps: number;
}

export function useCreateEscrow() {
  const chainId = useChainId();
  const factoryAddress = FACTORY_ADDRESS[chainId];
  const [newEscrowAddress, setNewEscrowAddress] = useState<Address | null>(null);

  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    onReplaced: (replacement) => {
      if (replacement.reason === "repriced") return;
    },
  });

  if (isSuccess && receipt && !newEscrowAddress) {
    try {
      const logs = parseEventLogs({
        abi: ESCROW_FACTORY_ABI,
        logs: receipt.logs,
        eventName: "EscrowCreated",
      });
      if (logs[0]?.args.escrow) {
        setNewEscrowAddress(logs[0].args.escrow as Address);
      }
    } catch {}
  }

  const createEscrow = (params: CreateEscrowParams) => {
    if (!factoryAddress) return;
    writeContract({
      address: factoryAddress,
      abi: ESCROW_FACTORY_ABI,
      functionName: "createEscrow",
      args: [
        params.recipient,
        params.amount,
        params.conditionType,
        params.conditionTarget,
        params.releaseTimestamp,
        params.deadline,
        params.senderYieldBps,
      ],
    });
  };

  return {
    createEscrow,
    txHash,
    isSubmitting: isPending,
    isConfirming,
    isSuccess,
    newEscrowAddress,
    error,
  };
}
