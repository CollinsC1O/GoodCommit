"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { getContracts } from '@/config/contracts';
import { STAKING_ABI, HabitType } from '@/config/abis';

export function useStaking(habitType: HabitType) {
  const { address, chainId } = useAccount();
  const contracts = getContracts(chainId || 44787);
  
  // Read stake info
  const { data: stakeInfo, refetch: refetchStake } = useReadContract({
    address: contracts.staking as `0x${string}`,
    abi: STAKING_ABI,
    functionName: 'getStakeInfo',
    args: address ? [address, habitType] : undefined,
    query: {
      enabled: !!address && contracts.staking !== '0x0000000000000000000000000000000000000000',
    },
  });
  
  // Plant seed (stake)
  const { writeContract: plantSeed, data: plantHash } = useWriteContract();
  
  const { isLoading: isPlanting, isSuccess: isPlanted } = useWaitForTransactionReceipt({
    hash: plantHash,
  });
  
  // Harvest rewards
  const { writeContract: harvest, data: harvestHash } = useWriteContract();
  
  const { isLoading: isHarvesting, isSuccess: isHarvested } = useWaitForTransactionReceipt({
    hash: harvestHash,
  });
  
  // Unstake
  const { writeContract: unstake, data: unstakeHash } = useWriteContract();
  
  const { isLoading: isUnstaking, isSuccess: isUnstaked } = useWaitForTransactionReceipt({
    hash: unstakeHash,
  });
  
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
  
  const harvestRewards = async () => {
    if (!address) throw new Error('Wallet not connected');
    
    harvest({
      address: contracts.staking as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'harvestRewards',
      args: [habitType],
    });
  };
  
  const unstakeTx = async () => {
    if (!address) throw new Error('Wallet not connected');
    
    unstake({
      address: contracts.staking as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'unstake',
      args: [habitType],
    });
  };
  
  return {
    stakeInfo: stakeInfo as [bigint, bigint, bigint, number, bigint, bigint] | undefined,
    plantSeed: plantSeedTx,
    isPlanting,
    isPlanted,
    harvestRewards,
    isHarvesting,
    isHarvested,
    unstake: unstakeTx,
    isUnstaking,
    isUnstaked,
    refetchStake,
  };
}
