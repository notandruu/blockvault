export function formatUSDC(amount: bigint, decimals = 2): string {
  const value = Number(amount) / 1e6;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatYieldBps(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

export function formatYieldSplit(senderBps: number): string {
  const recipientPct = (10000 - senderBps) / 100;
  const senderPct = senderBps / 100;
  return `${recipientPct.toFixed(0)}% recipient / ${senderPct.toFixed(0)}% sender`;
}

export function isZeroAddress(address: string): boolean {
  return address === "0x0000000000000000000000000000000000000000";
}
