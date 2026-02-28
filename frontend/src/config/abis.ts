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

// GoodCommitStaking contract ABI
export const STAKING_ABI = [
  {
    inputs: [
      { name: 'habitType', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
      { name: 'durationInDays', type: 'uint256' },
    ],
    name: 'plantSeed',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'habitType', type: 'uint8' }],
    name: 'harvestRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'habitType', type: 'uint8' }],
    name: 'unstake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'getStakeInfo',
    outputs: [
      { name: 'stakedAmount', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'currentStreak', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'accumulatedRewards', type: 'uint256' },
      { name: 'lastCheckIn', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'isCheckInOverdue',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSlashedToUBI',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Habit types enum (matches contract)
export enum HabitType {
  Health = 0,
  Academics = 1,
  Focus = 2,
}

// Plant status enum (matches contract)
export enum PlantStatus {
  Active = 0,
  Mature = 1,
  Withered = 2,
  Harvested = 3,
}
