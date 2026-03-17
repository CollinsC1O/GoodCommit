// Minimal ABI for G$ token (ERC20)
export const G_TOKEN_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// GoodCommitStaking contract ABI - UPDATED to match actual contract
import GoodCommitStaking from './GoodCommitStaking.json';
export const STAKING_ABI = GoodCommitStaking.abi;

// Habit types enum (matches contract)
export enum HabitType {
  Health = 0,
  Academics = 1,
}

// Plant status enum (matches contract) - UPDATED
export enum PlantStatus {
  Seed = 0,
  Sprout = 1,
  Growing = 2,
  Mature = 3,
  Fruiting = 4,
  Withered = 5,
  Harvested = 6,
}

// Contract addresses - Use environment variables
export const STAKING_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const G_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_G_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
