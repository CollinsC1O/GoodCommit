"use client";

import { useGToken } from '@/hooks/useGToken';
import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';

export default function GTokenBalance() {
  const [mounted, setMounted] = useState(false);
  const { isConnected } = useAccount();
  const { balance } = useGToken();
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return (
      <div className="px-4 py-1.5 rounded-full bg-slate-800/80 border border-white/5 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-500">-- G$</span>
      </div>
    );
  }
  
  if (!isConnected) {
    return (
      <div className="px-4 py-1.5 rounded-full bg-slate-800/80 border border-white/5 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-500">-- G$</span>
      </div>
    );
  }
  
  const displayBalance = parseFloat(balance).toFixed(2);
  
  return (
    <div className="px-4 py-1.5 rounded-full bg-slate-800/80 border border-white/5 flex items-center gap-2">
      <span className="text-sm font-medium text-emerald-400">{displayBalance} G$</span>
    </div>
  );
}
