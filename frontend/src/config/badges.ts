export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type BadgeCategory =
  | 'streak'
  | 'workout'
  | 'academic'
  | 'plant'
  | 'staking'
  | 'harvest'
  | 'points';

export interface BadgeDefinition {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: BadgeCategory;
  icon: string;
  rarity: BadgeRarity;
  requirementType: string;
  requirementValue: number;
  sortOrder: number;
}

export interface UserBadge extends BadgeDefinition {
  progress: number;
  total: number;
  percentage: number;
  unlockedAt: string | null;
  isUnlocked: boolean;
}

export interface AchievementSummary {
  totalBadges: number;
  totalPossible: number;
  rareCount: number;
  epicCount: number;
  legendaryCount: number;
  mythicCount: number;
  completionPercentage: number;
}

export interface AchievementsResponse {
  walletAddress: string;
  unlocked: UserBadge[];
  locked: UserBadge[];
  stats: Record<string, unknown>;
  summary: AchievementSummary;
}

export interface RecentBadge {
  badgeId: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  rarity: string;
  unlockedAt: string;
}

export const RARITY_CONFIG: Record<BadgeRarity, { label: string; color: string; glow: string }> = {
  common: {
    label: 'Common',
    color: 'text-slate-300 border-slate-600 bg-slate-700/50',
    glow: 'shadow-slate-500/20',
  },
  rare: {
    label: 'Rare',
    color: 'text-blue-300 border-blue-600 bg-blue-700/50',
    glow: 'shadow-blue-500/30',
  },
  epic: {
    label: 'Epic',
    color: 'text-purple-300 border-purple-600 bg-purple-700/50',
    glow: 'shadow-purple-500/30',
  },
  legendary: {
    label: 'Legendary',
    color: 'text-orange-300 border-orange-600 bg-orange-700/50',
    glow: 'shadow-orange-500/30',
  },
  mythic: {
    label: 'Mythic',
    color: 'text-rose-300 border-rose-600 bg-rose-700/50',
    glow: 'shadow-rose-500/30',
  },
};

export const CATEGORY_CONFIG: Record<BadgeCategory, { label: string; icon: string }> = {
  streak: { label: 'Streak', icon: '🔥' },
  workout: { label: 'Fitness', icon: '💪' },
  academic: { label: 'Academic', icon: '📚' },
  plant: { label: 'Plant Growth', icon: '🌱' },
  staking: { label: 'Staking', icon: '💎' },
  harvest: { label: 'Harvest', icon: '🧺' },
  points: { label: 'Points', icon: '⭐' },
};
