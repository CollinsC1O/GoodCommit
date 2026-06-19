const { ethers } = require('ethers');
const { openBadgeDb } = require('./db/badge-db');
const { BADGE_DEFINITIONS } = require('./badgeDefinitions');
const { getStreak } = require('./streakService');

const badgeDb = openBadgeDb();
const STAKING_ABI = require('./config/GoodCommitStaking.json').abi;

function normalizeAddress(address) {
  return ethers.getAddress(address).toLowerCase();
}

function getExistingBadges(walletAddress) {
  const normalized = normalizeAddress(walletAddress);
  return badgeDb
    .prepare(
      `SELECT ub.*, bd.slug, bd.title, bd.description, bd.category, bd.icon, bd.rarity,
              bd.requirementType, bd.requirementValue, bd.rewardType, bd.rewardValue
       FROM user_badges ub
       JOIN badge_definitions bd ON ub.badgeId = bd.id
       WHERE ub.walletAddress = ?
       ORDER BY ub.unlockedAt ASC`
    )
    .all(normalized);
}

function getBadgeDefinitionsFromDb() {
  return badgeDb.prepare('SELECT * FROM badge_definitions ORDER BY sortOrder ASC').all();
}

function seedBadgeDefinitions() {
  const existing = badgeDb.prepare('SELECT COUNT(*) as count FROM badge_definitions').get();
  if (existing.count > 0) return;

  const insert = badgeDb.prepare(
    `INSERT INTO badge_definitions (slug, title, description, category, icon, rarity, requirementType, requirementValue, sortOrder, rewardType, rewardValue)
     VALUES (@slug, @title, @description, @category, @icon, @rarity, @requirementType, @requirementValue, @sortOrder, @rewardType, @rewardValue)`
  );

  const tx = badgeDb.transaction(() => {
    for (const badge of BADGE_DEFINITIONS) {
      insert.run(badge);
    }
  });

  tx();
}

function getPlantStageFromPoints(points) {
  if (points >= 100) return 4;
  if (points >= 60) return 3;
  if (points >= 30) return 2;
  if (points >= 10) return 1;
  return 0;
}

async function loadUserStats(walletAddress, provider) {
  const normalized = normalizeAddress(walletAddress);
  const sc = new ethers.Contract(
    process.env.STAKING_CONTRACT_ADDRESS,
    STAKING_ABI,
    provider
  );

  const [profile, healthStake, academicsStake] = await Promise.all([
    sc.getUserProfile(normalized).catch(() => null),
    sc.getHabitStake(normalized, 0).catch(() => null),
    sc.getHabitStake(normalized, 1).catch(() => null),
  ]);

  const streak = getStreak(normalized);

  let totalWorkouts = 0;
  let totalQuizzes = 0;
  let totalPointsEarned = 0;
  let totalClaimed = 0;
  let totalStaked = 0;
  let healthPoints = 0;
  let academicsPoints = 0;
  let hasInitialized = false;

  if (profile) {
    totalWorkouts = Number(profile[3]);
    totalQuizzes = Number(profile[4]);
    totalPointsEarned = Number(profile[2]);
    totalClaimed = Number(ethers.formatUnits(profile[5], 18));
    totalStaked = Number(ethers.formatUnits(profile[6], 18));
    hasInitialized = profile[0];
  }

  if (healthStake) {
    healthPoints = Number(healthStake[1]);
  }
  if (academicsStake) {
    academicsPoints = Number(academicsStake[1]);
  }

  const maxPlantStage = Math.max(
    getPlantStageFromPoints(healthPoints),
    getPlantStageFromPoints(academicsPoints)
  );

  return {
    walletAddress: normalized,
    streakDays: streak ? streak.currentStreak : 0,
    longestStreak: streak ? streak.longestStreak : 0,
    totalDaysActive: streak ? streak.totalDaysActive : 0,
    totalWorkouts,
    totalQuizzes,
    totalPointsEarned,
    totalClaimed,
    totalStaked,
    maxPlantStage,
    hasInitialized,
    healthPoints,
    academicsPoints,
  };
}

function evaluateRequirement(requirementType, requirementValue, stats) {
  switch (requirementType) {
    case 'streak_days':
      return stats.streakDays >= requirementValue;

    case 'workouts_total':
      return stats.totalWorkouts >= requirementValue;

    case 'quizzes_total':
      return stats.totalQuizzes >= requirementValue;

    case 'points_total':
      return stats.totalPointsEarned >= requirementValue;

    case 'plant_stage':
      return stats.maxPlantStage >= requirementValue;

    case 'has_stake':
      return stats.hasInitialized === true || stats.totalStaked > 0;

    case 'total_staked':
      return stats.totalStaked >= requirementValue;

    case 'total_claimed':
      return stats.totalClaimed >= requirementValue;

    default:
      return false;
  }
}

function getProgress(requirementType, requirementValue, stats) {
  switch (requirementType) {
    case 'streak_days':
      return Math.min(stats.streakDays, requirementValue);

    case 'workouts_total':
      return Math.min(stats.totalWorkouts, requirementValue);

    case 'quizzes_total':
      return Math.min(stats.totalQuizzes, requirementValue);

    case 'points_total':
      return Math.min(stats.totalPointsEarned, requirementValue);

    case 'plant_stage':
      return Math.min(stats.maxPlantStage, requirementValue);

    case 'has_stake':
      return (stats.hasInitialized || stats.totalStaked > 0) ? 1 : 0;

    case 'total_staked':
      return Math.min(stats.totalStaked, requirementValue);

    case 'total_claimed':
      return Math.min(stats.totalClaimed, requirementValue);

    default:
      return 0;
  }
}

function awardBadge(walletAddress, badgeId) {
  const normalized = normalizeAddress(walletAddress);
  const now = new Date().toISOString();

  try {
    const existing = badgeDb
      .prepare('SELECT id FROM user_badges WHERE walletAddress = ? AND badgeId = ?')
      .get(normalized, badgeId);

    if (existing) return false;

    const result = badgeDb
      .prepare(
        'INSERT INTO user_badges (walletAddress, badgeId, unlockedAt) VALUES (?, ?, ?)'
      )
      .run(normalized, badgeId, now);

    return result.changes > 0;
  } catch {
    return false;
  }
}

async function evaluateUser(walletAddress, provider) {
  const normalized = normalizeAddress(walletAddress);
  const stats = await loadUserStats(normalized, provider);
  const definitions = getBadgeDefinitionsFromDb();
  const existingBadges = getExistingBadges(normalized);
  const existingBadgeIds = new Set(existingBadges.map((b) => b.badgeId));

  const newlyUnlocked = [];

  for (const def of definitions) {
    const isUnlocked = existingBadgeIds.has(def.id);
    const met = evaluateRequirement(def.requirementType, def.requirementValue, stats);
    const progress = getProgress(def.requirementType, def.requirementValue, stats);

    if (met && !isUnlocked) {
      const awarded = awardBadge(normalized, def.id);
      if (awarded) {
        newlyUnlocked.push({
          badgeId: def.id,
          slug: def.slug,
          title: def.title,
          description: def.description,
          category: def.category,
          icon: def.icon,
          rarity: def.rarity,
          unlockedAt: new Date().toISOString(),
        });
      }
    }
  }

  return {
    newlyUnlocked,
    stats,
  };
}

async function getAchievements(walletAddress, provider) {
  const normalized = normalizeAddress(walletAddress);
  let stats;
  try {
    stats = await loadUserStats(normalized, provider);
  } catch {
    stats = {
      walletAddress: normalized,
      streakDays: 0,
      longestStreak: 0,
      totalDaysActive: 0,
      totalWorkouts: 0,
      totalQuizzes: 0,
      totalPointsEarned: 0,
      totalClaimed: 0,
      totalStaked: 0,
      maxPlantStage: 0,
      hasInitialized: false,
      healthPoints: 0,
      academicsPoints: 0,
    };
  }

  const definitions = getBadgeDefinitionsFromDb();
  const existingBadges = getExistingBadges(normalized);
  const existingBadgeIds = new Set(existingBadges.map((b) => b.badgeId));

  const unlocked = [];
  const locked = [];
  let totalBadges = 0;
  let rareCount = 0;
  let epicCount = 0;
  let legendaryCount = 0;
  let mythicCount = 0;

  for (const def of definitions) {
    const isUnlocked = existingBadgeIds.has(def.id);
    const progress = getProgress(def.requirementType, def.requirementValue, stats);
    const met = evaluateRequirement(def.requirementType, def.requirementValue, stats);

    const badgeData = {
      id: def.id,
      slug: def.slug,
      title: def.title,
      description: def.description,
      category: def.category,
      icon: def.icon,
      rarity: def.rarity,
      requirementType: def.requirementType,
      requirementValue: def.requirementValue,
      progress,
      total: def.requirementValue,
      percentage: Math.min(Math.round((progress / def.requirementValue) * 100), 100),
      unlockedAt: null,
      isUnlocked,
      sortOrder: def.sortOrder,
    };

    if (isUnlocked) {
      const existing = existingBadges.find((b) => b.badgeId === def.id);
      badgeData.unlockedAt = existing ? existing.unlockedAt : null;
      unlocked.push(badgeData);
      totalBadges++;
      if (def.rarity === 'rare') rareCount++;
      else if (def.rarity === 'epic') epicCount++;
      else if (def.rarity === 'legendary') legendaryCount++;
      else if (def.rarity === 'mythic') mythicCount++;
    } else {
      locked.push(badgeData);
    }
  }

  return {
    walletAddress: normalized,
    unlocked,
    locked,
    stats,
    summary: {
      totalBadges,
      totalPossible: definitions.length,
      rareCount,
      epicCount,
      legendaryCount,
      mythicCount,
      completionPercentage: Math.round((totalBadges / definitions.length) * 100),
    },
  };
}

function getRecentAchievements(walletAddress, limit = 5) {
  const normalized = normalizeAddress(walletAddress);
  return badgeDb
    .prepare(
      `SELECT ub.*, bd.slug, bd.title, bd.description, bd.category, bd.icon, bd.rarity
       FROM user_badges ub
       JOIN badge_definitions bd ON ub.badgeId = bd.id
       WHERE ub.walletAddress = ?
       ORDER BY ub.unlockedAt DESC
       LIMIT ?`
    )
    .all(normalized, limit)
    .map((row) => ({
      badgeId: row.badgeId,
      slug: row.slug,
      title: row.title,
      description: row.description,
      category: row.category,
      icon: row.icon,
      rarity: row.rarity,
      unlockedAt: row.unlockedAt,
    }));
}

function closeDb() {
  badgeDb.close();
}

seedBadgeDefinitions();

module.exports = {
  evaluateUser,
  getAchievements,
  getRecentAchievements,
  getExistingBadges,
  loadUserStats,
  evaluateRequirement,
  getProgress,
  getPlantStageFromPoints,
  awardBadge,
  closeDb,
};
