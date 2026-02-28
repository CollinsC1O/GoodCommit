"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { getContracts } from '@/config/contracts';
import { G_TOKEN_ABI } from '@/config/abis';

export function useGToken() {
  const { address, chainId } = useAccount();
  const contracts = getContracts(chainId || 44787);
  
  // Read G$ balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: contracts.gToken as `0x${string}`,
    abi: G_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });
  
  // Approve spending
  const { writeContract: approve, data: approveHash } = useWriteContract();
  
  const { isLoading: isApproving, isSuccess: isApproved } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  
  const approveStaking = async (amount: string) => {
    if (!address) throw new Error('Wallet not connected');
    
    const amountWei = parseUnits(amount, 18); // G$ has 18 decimals
    
    approve({
      address: contracts.gToken as `0x${string}`,
      abi: G_TOKEN_ABI,
      functionName: 'approve',
      args: [contracts.staking as `0x${string}`, amountWei],
    });
  };
  
  const formattedBalance = balance ? formatUnits(balance as bigint, 18) : '0';
  
  return {
    balance: formattedBalance,
    balanceRaw: balance,
    approveStaking,
    isApproving,
    isApproved,
    refetchBalance,
  };
}
