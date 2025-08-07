"use client";

import { type Hash } from "viem";
import { useChainId } from "wagmi";
import { base } from "wagmi/chains";

interface Props {
  hash: Hash | undefined;
  isSubmitting: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: Error | null;
  label?: string;
}

export function TransactionStatus({
  hash,
  isSubmitting,
  isConfirming,
  isSuccess,
  error,
  label = "Transaction",
}: Props) {
  const chainId = useChainId();
  const explorerBase = chainId === base.id
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";

  if (!isSubmitting && !isConfirming && !isSuccess && !error && !hash) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      {isSubmitting && (
        <p className="text-gray-600">Confirm in wallet…</p>
      )}
      {isConfirming && hash && (
        <p className="text-gray-600">
          Confirming —{" "}
          <a
            href={`${explorerBase}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-900"
          >
            {hash.slice(0, 10)}…
          </a>
        </p>
      )}
      {isSuccess && (
        <p className="text-green-700">
          {label} confirmed
          {hash && (
            <>
              {" — "}
              <a
                href={`${explorerBase}/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                view
              </a>
            </>
          )}
        </p>
      )}
      {error && (
        <p className="text-red-600 break-all">
          {(error as { shortMessage?: string }).shortMessage ?? error.message}
        </p>
      )}
    </div>
  );
}
