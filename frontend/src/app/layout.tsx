import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "@/providers/Web3Provider";
import { ConnectWallet } from "@/components/ConnectWallet";
import Link from "next/link";

export const metadata: Metadata = {
  title: "BlockVault",
  description: "Programmable escrow that earns yield while it waits — USDC on Aave V3, Base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 font-sans">
        <Web3Provider>
          <header className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur z-10">
            <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/" className="font-semibold text-gray-900 hover:text-gray-600 transition-colors">
                BlockVault
              </Link>
              <nav className="flex items-center gap-6">
                <Link href="/create" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  New escrow
                </Link>
                <ConnectWallet />
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </Web3Provider>
      </body>
    </html>
  );
}
