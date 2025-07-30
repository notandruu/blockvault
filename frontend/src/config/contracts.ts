import { type Address } from "viem";

export const USDC_ADDRESS: Record<number, Address> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export const FACTORY_ADDRESS: Record<number, Address> = {
  8453: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS_BASE || "0x0000000000000000000000000000000000000000") as Address,
  84532: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS_SEPOLIA || "0x0000000000000000000000000000000000000000") as Address,
};

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const ESCROW_FACTORY_ABI = [
  {
    name: "createEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "conditionType", type: "uint8" },
      { name: "conditionTarget", type: "address" },
      { name: "releaseTimestamp", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "senderYieldBps", type: "uint16" },
    ],
    outputs: [{ name: "escrow", type: "address" }],
  },
  {
    name: "getEscrowsByAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "getEscrowsBySender",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "getEscrowsByRecipient",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "EscrowCreated",
    type: "event",
    inputs: [
      { name: "escrow", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "conditionType", type: "uint8", indexed: false },
      { name: "conditionTarget", type: "address", indexed: false },
      { name: "releaseTimestamp", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
      { name: "senderYieldBps", type: "uint16", indexed: false },
      { name: "createdAt", type: "uint256", indexed: false },
    ],
  },
] as const;

export const YIELD_ESCROW_ABI = [
  {
    name: "getEscrowInfo",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_sender", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_conditionType", type: "uint8" },
      { name: "_conditionTarget", type: "address" },
      { name: "_releaseTimestamp", type: "uint256" },
      { name: "_deadline", type: "uint256" },
      { name: "_senderYieldBps", type: "uint16" },
      { name: "_state", type: "uint8" },
      { name: "_manuallyApproved", type: "bool" },
      { name: "_conditionMetTimestamp", type: "uint256" },
      { name: "_currentYield", type: "uint256" },
      { name: "_totalValue", type: "uint256" },
      { name: "_snapshotLiquidityIndex", type: "uint256" },
      { name: "_currentLiquidityIndex", type: "uint256" },
    ],
  },
  {
    name: "getCurrentYield",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "release",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "refund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "recordConditionMet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "isConditionMet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "state",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export type ConditionType = 0 | 1 | 2;
export const CONDITION_LABELS: Record<ConditionType, string> = {
  0: "Time-Based",
  1: "Manual Approval",
  2: "Oracle",
};

export type EscrowState = 0 | 1 | 2;
export const STATE_LABELS: Record<EscrowState, string> = {
  0: "Active",
  1: "Released",
  2: "Refunded",
};

export interface EscrowInfo {
  sender: Address;
  recipient: Address;
  amount: bigint;
  conditionType: ConditionType;
  conditionTarget: Address;
  releaseTimestamp: bigint;
  deadline: bigint;
  senderYieldBps: number;
  state: EscrowState;
  manuallyApproved: boolean;
  conditionMetTimestamp: bigint;
  currentYield: bigint;
  totalValue: bigint;
  snapshotLiquidityIndex: bigint;
  currentLiquidityIndex: bigint;
}

export function parseEscrowInfo(raw: readonly unknown[]): EscrowInfo {
  return {
    sender: raw[0] as Address,
    recipient: raw[1] as Address,
    amount: raw[2] as bigint,
    conditionType: raw[3] as ConditionType,
    conditionTarget: raw[4] as Address,
    releaseTimestamp: raw[5] as bigint,
    deadline: raw[6] as bigint,
    senderYieldBps: raw[7] as number,
    state: raw[8] as EscrowState,
    manuallyApproved: raw[9] as boolean,
    conditionMetTimestamp: raw[10] as bigint,
    currentYield: raw[11] as bigint,
    totalValue: raw[12] as bigint,
    snapshotLiquidityIndex: raw[13] as bigint,
    currentLiquidityIndex: raw[14] as bigint,
  };
}
