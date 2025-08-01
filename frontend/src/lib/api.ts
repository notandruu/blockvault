const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export interface BackendEscrow {
  escrow_address: string;
  sender: string;
  recipient: string;
  amount: string;
  condition_type: number;
  state: string;
  created_at: string;
  total_yield: string | null;
  sender_yield: string | null;
  recipient_yield: string | null;
  resolved_at: string | null;
  resolved_tx_hash: string | null;
}

export async function fetchEscrowsByAddress(address: string): Promise<BackendEscrow[]> {
  const res = await fetch(`${BASE_URL}/escrows?address=${address}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.escrows ?? [];
}

export async function fetchEscrow(escrowAddress: string): Promise<BackendEscrow | null> {
  const res = await fetch(`${BASE_URL}/escrows/${escrowAddress}`);
  if (!res.ok) return null;
  return res.json();
}
