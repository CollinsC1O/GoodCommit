"use client";

import WalletConnectButton from './WalletConnectButton';
import PointsDisplay from './PointsDisplay';
import AccumulatedPoints from './AccumulatedPoints';

export default function NavBar() {
  return (
    <nav className="relative z-50 w-full border-b border-white/10 bg-slate-950/50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 min-h-16 sm:min-h-20 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-tr from-green-400 to-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
            <span className="text-white font-bold text-xl leading-none pt-0.5">🌱</span>
          </div>
          <span className="hidden min-[430px]:block truncate text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
            GoodCommit
          </span>
        </div>
        
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-3">
          <AccumulatedPoints />
          <PointsDisplay />
          <WalletConnectButton />
        </div>
      </div>
    </nav>
  );
}
