"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { getContracts } from '@/config/contracts';
import { STAKING_ABI, HabitType } from '@/config/abis';

export function useStaking(habitType: HabitType) {
  const { address, chainId } = useAccount();
  const contracts = getContracts(chainId || 44787);
  
  // Read stake info - UPDATED to match contract return values
  const { data: stakeInfo, refetch: refetchStake } = useReadContract({
    address: contracts.staking as `0x${string}`,
    abi: STAKING_ABI,
    functionName: 'getStakeInfo',
    args: address ? [address, habitType] : undefined,
    query: {
      enabled: !!address && contracts.staking !== '0x0000000000000000000000000000000000000000',
    },
  });
  
  // Read user profile
  const { data: userProfile, refetch: refetchProfile } = useReadContract({
    address: contracts.staking as `0x${string}`,
    abi: STAKING_ABI,
    functionName: 'getUserProfile',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && contracts.staking !== '0x0000000000000000000000000000000000000000',
    },
  });
  
  // Claim initial seed
  const { writeContract: claimSeed, data: claimSeedHash } = useWriteContract();
  
  const { isLoading: isClaimingSeed, isSuccess: isSeedClaimed } = useWaitForTransactionReceipt({
    hash: claimSeedHash,
  });
  
  // Plant seed (stake)
  const { writeContract: plantSeed, data: plantHash } = useWriteContract();
  
  const { isLoading: isPlanting, isSuccess: isPlanted } = useWaitForTransactionReceipt({
    hash: plantHash,
  });
  
  // Claim all points
  const { writeContract: claimAll, data: claimAllHash } = useWriteContract();
  
  const { isLoading: isClaimingAll, isSuccess: isAllClaimed } = useWaitForTransactionReceipt({
    hash: claimAllHash,
  });
  
  // Stake partial and claim
  const { writeContract: stakePartial, data: stakePartialHash } = useWriteContract();
  
  const { isLoading: isStakingPartial, isSuccess: isPartialStaked } = useWaitForTransactionReceipt({
    hash: stakePartialHash,
  });
  
  // Stake all points
  const { writeContract: stakeAll, data: stakeAllHash } = useWriteContract();
  
  const { isLoading: isStakingAll, isSuccess: isAllStaked } = useWaitForTransactionReceipt({
    hash: stakeAllHash,
  });
  
  // Unstake tokens
  const { writeContract: unstake, data: unstakeHash } = useWriteContract();
  
  const { isLoading: isUnstaking, isSuccess: isUnstaked } = useWaitForTransactionReceipt({
    hash: unstakeHash,
  });
  
  const claimInitialSeed = async () => {
    if (!address) throw new Error('Wallet not connected');
    if (contracts.staking === '0x0000000000000000000000000000000000000000') {
      throw new Error('Staking contract not deployed yet');
    }
    
    claimSeed({
      address: contracts.staking as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'claimInitialSeed',
    });
  };
  
  const plantSeedTx = async (amount: string, duration: number) => {
    if (!address) throw new Error('Wallet not connected');
    if (contracts.staking === '0x0000000000000000000000000000000000000000') {
      throw new Error('Staking contract not deployed yet');
    }
    
    const amountWei = parseUnits(amount, 18);
    
    plantSeed({
      address: contracts.staking as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'plantSeed',
      args: [habitType, amountWei, BigInt(duration)],
    });
  };
  
  const claimAllPoints = async () => {
    if (!address) throw new Error('Wallet not connected');
    
    claimAll({
      address: contracts.staking as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'claimAllPoints',
      args: [habitType],
    });
  };
  
  const stakePartialAndClaim = async (pointsToStake: bigint) => {
    if (!address) throw new Error('Wallet not connected');
    
    stakePartial({
      address: contracts.staking as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'stakePartialAndClaim',
      args: [habitType, pointsToStake],
    });
  };
  
  const stakeAllPoints = async () => {
    if (!address) throw new Error('Wallet not connected');
    
    stakeAll({
      address: contracts.staking as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'stakeAllPoints',
      args: [habitType],
    });
  };
  
  const unstakeTokens = async (amount: string) => {
    if (!address) throw new Error('Wallet not connected');
    
    const amountWei = parseUnits(amount, 18);
    
    unstake({
      address: contracts.staking as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'unstakeTokens',
      args: [habitType, amountWei],
    });
  };
  
  return {
    // Data - UPDATED to match contract return: [stakedAmount, points, duration, currentStreak, status, lastActivity]
    stakeInfo: stakeInfo as [bigint, bigint, bigint, bigint, number, bigint] | undefined,
    userProfile: userProfile as [boolean, boolean, bigint, bigint, bigint, bigint, bigint] | undefined,
    
    // Initial seed
    claimInitialSeed,
    isClaimingSeed,
    isSeedClaimed,
    
    // Planting
    plantSeed: plantSeedTx,
    isPlanting,
    isPlanted,
    
    // Harvesting options
    claimAllPoints,
    isClaimingAll,
    isAllClaimed,
    
    stakePartialAndClaim,
    isStakingPartial,
    isPartialStaked,
    
    stakeAllPoints,
    isStakingAll,
    isAllStaked,
    
    // Unstaking
    unstakeTokens,
    isUnstaking,
    isUnstaked,
    
    // Refetch
    refetchStake,
    refetchProfile,
  };
}
