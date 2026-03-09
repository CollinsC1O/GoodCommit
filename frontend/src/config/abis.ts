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
export const STAKING_ABI = [
  // Claim initial seed (one-time 10 G$)
  {
    inputs: [],
    name: 'claimInitialSeed',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Plant seed (stake G$ tokens)
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
  // Harvest options
  {
    inputs: [{ name: 'habitType', type: 'uint8' }],
    name: 'claimPoints',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Unstake tokens (not points)
  {
    inputs: [
      { name: 'habitType', type: 'uint8' }
    ],
    name: 'unstakeTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // View functions
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'getStakeInfo',
    outputs: [
      { name: 'stakedAmount', type: 'uint256' },
      { name: 'points', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'currentStreak', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'lastActivity', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'checkDecayStatus',
    outputs: [
      { name: 'currentPoints', type: 'uint256' },
      { name: 'pointsAfterDecay', type: 'uint256' },
      { name: 'decayAmount', type: 'uint256' },
      { name: 'daysMissed', type: 'uint256' },
      { name: 'willWither', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserProfile',
    outputs: [
      { name: 'initialized', type: 'bool' },
      { name: 'hasClaimedSeed', type: 'bool' },
      { name: 'totalPointsEarned', type: 'uint256' },
      { name: 'totalWorkoutsCompleted', type: 'uint256' },
      { name: 'totalQuizzesCompleted', type: 'uint256' },
      { name: 'totalClaimed', type: 'uint256' },
      { name: 'totalStaked', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'getWorkoutCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'getQuizCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'points', type: 'uint256' }],
    name: 'pointsToGToken',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'gTokenToPoints',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getDecayRewardPool',
    outputs: [{ name: '', type: 'uint256' }],
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
  {
    inputs: [],
    name: 'totalSeedsDistributed',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Constants
  {
    inputs: [],
    name: 'INITIAL_SEED_AMOUNT',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'POINTS_TO_GTOKEN_RATE',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'DAILY_DECAY_PERCENTAGE',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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
