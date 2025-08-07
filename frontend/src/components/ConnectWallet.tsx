"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId, useSwitchChain } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";

export function ConnectWallet() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongNetwork = chainId !== base.id && chainId !== baseSepolia.id;

  return (
    <div className="flex items-center gap-3">
      {isWrongNetwork && (
        <button
          onClick={() => switchChain({ chainId: base.id })}
          className="text-sm px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
        >
          Switch to Base
        </button>
      )}
      <ConnectButton
        accountStatus="avatar"
        chainStatus="icon"
        showBalance={false}
      />
    </div>
  );
}
