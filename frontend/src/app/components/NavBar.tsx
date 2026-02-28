"use client";

import WalletConnectButton from './WalletConnectButton';
import GTokenBalance from './GTokenBalance';

export default function NavBar() {
  return (
    <nav className="relative z-50 w-full border-b border-white/10 bg-slate-950/50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-green-400 to-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
            <span className="text-white font-bold text-xl leading-none pt-0.5">🌱</span>
          </div>
          <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
            GoodCommit
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <GTokenBalance />
          <WalletConnectButton />
        </div>
      </div>
    </nav>
  );
}
