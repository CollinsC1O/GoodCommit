"use client";

import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { STAKING_CONTRACT_ADDRESS, STAKING_ABI, HabitType } from '@/config/abis';

export default function AccumulatedPoints() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  
  // Read Health habit points
  const { data: healthStake } = useReadContract({
    address: STAKING_CONTRACT_ADDRESS,
    abi: STAKING_ABI,
    functionName: 'getStakeInfo',
    args: address ? [address, HabitType.Health] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  // Read Academics habit points
  const { data: academicsStake } = useReadContract({
    address: STAKING_CONTRACT_ADDRESS,
    abi: STAKING_ABI,
    functionName: 'getStakeInfo',
    args: address ? [address, HabitType.Academics] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 5000,
    },
  });
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return (
      <div className="px-4 py-1.5 rounded-full bg-purple-900/30 border border-purple-500/30 flex items-center gap-2">
        <span className="text-xs text-purple-400">⭐</span>
        <span className="text-sm font-medium text-purple-300">0 pts</span>
      </div>
    );
  }
  
  if (!isConnected) {
    return (
      <div className="px-4 py-1.5 rounded-full bg-purple-900/30 border border-purple-500/30 flex items-center gap-2">
        <span className="text-xs text-purple-400">⭐</span>
        <span className="text-sm font-medium text-purple-300">0 pts</span>
      </div>
    );
  }
  
  // Calculate total points from both habits
  const healthPoints = healthStake ? Number(healthStake[1]) : 0; // points is index 1
  const academicsPoints = academicsStake ? Number(academicsStake[1]) : 0;
  const totalPoints = healthPoints + academicsPoints;
  
  return (
    <div className="px-4 py-1.5 rounded-full bg-purple-900/30 border border-purple-500/30 flex items-center gap-2">
      <span className="text-xs text-purple-400">⭐</span>
      <span className="text-sm font-medium text-purple-300">{totalPoints} pts</span>
    </div>
  );
}
