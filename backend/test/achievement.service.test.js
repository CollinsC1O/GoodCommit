const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = path.resolve(__dirname, 'tmp-achievement.db');

before(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  process.env.STREAK_DB_PATH = TEST_DB_PATH;
});

after(() => {
  const { closeDb } = require('../achievementService');
  try { closeDb(); } catch {}
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe('Achievement Service', () => {
  let achievementService;
  let badgeDefinitions;

  before(() => {
    achievementService = require('../achievementService');
    badgeDefinitions = require('../badgeDefinitions').BADGE_DEFINITIONS;
  });

  describe('Badge Definitions', () => {
    it('has all 27 badge definitions', () => {
      assert.strictEqual(badgeDefinitions.length, 27);
    });

    it('has all required categories', () => {
      const categories = new Set(badgeDefinitions.map((b) => b.category));
      const expected = ['streak', 'workout', 'academic', 'plant', 'staking', 'harvest', 'points'];
      for (const cat of expected) {
        assert.ok(categories.has(cat), `Missing category: ${cat}`);
      }
    });

    it('has all required rarities', () => {
      const rarities = new Set(badgeDefinitions.map((b) => b.rarity));
      const expected = ['common', 'rare', 'epic', 'legendary', 'mythic'];
      for (const r of expected) {
        assert.ok(rarities.has(r), `Missing rarity: ${r}`);
      }
    });

    it('has unique slugs', () => {
      const slugs = badgeDefinitions.map((b) => b.slug);
      assert.strictEqual(new Set(slugs).size, slugs.length);
    });

    it('has consecutive sort orders', () => {
      const orders = badgeDefinitions.map((b) => b.sortOrder).sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        assert.strictEqual(orders[i], i + 1, `Sort order gap at position ${i}`);
      }
    });

    it('has valid requirement types', () => {
      const validTypes = [
        'streak_days',
        'workouts_total',
        'quizzes_total',
        'points_total',
        'plant_stage',
        'has_stake',
        'total_staked',
        'total_claimed',
      ];
      for (const badge of badgeDefinitions) {
        assert.ok(
          validTypes.includes(badge.requirementType),
          `Badge "${badge.slug}" has invalid requirementType: ${badge.requirementType}`
        );
      }
    });
  });

  describe('Badge Database Operations', () => {
    it('seeds badge definitions on initialization', () => {
      const db = require('../db/badge-db').openBadgeDb();
      const count = db.prepare('SELECT COUNT(*) as count FROM badge_definitions').get();
      assert.strictEqual(count.count, 27);
      db.close();
    });
  });

  describe('Plant Stage Calculation', () => {
    it('returns Seed for 0 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(0), 0);
    });

    it('returns Seed for 9 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(9), 0);
    });

    it('returns Sprout for 10 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(10), 1);
    });

    it('returns Sprout for 29 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(29), 1);
    });

    it('returns Growing for 30 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(30), 2);
    });

    it('returns Growing for 59 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(59), 2);
    });

    it('returns Mature for 60 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(60), 3);
    });

    it('returns Mature for 99 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(99), 3);
    });

    it('returns Fruiting for 100 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(100), 4);
    });

    it('returns Fruiting for 500 points', () => {
      assert.strictEqual(achievementService.getPlantStageFromPoints(500), 4);
    });
  });

  describe('Requirement Evaluation (static tests)', () => {
    it('evaluates streak_days requirement', () => {
      const stats = { streakDays: 7 };
      assert.ok(achievementService.evaluateRequirement('streak_days', 7, stats));
      assert.ok(!achievementService.evaluateRequirement('streak_days', 8, stats));
    });

    it('evaluates workouts_total requirement', () => {
      const stats = { totalWorkouts: 25 };
      assert.ok(achievementService.evaluateRequirement('workouts_total', 25, stats));
      assert.ok(!achievementService.evaluateRequirement('workouts_total', 26, stats));
    });

    it('evaluates quizzes_total requirement', () => {
      const stats = { totalQuizzes: 100 };
      assert.ok(achievementService.evaluateRequirement('quizzes_total', 100, stats));
      assert.ok(!achievementService.evaluateRequirement('quizzes_total', 101, stats));
    });

    it('evaluates points_total requirement', () => {
      const stats = { totalPointsEarned: 1000 };
      assert.ok(achievementService.evaluateRequirement('points_total', 1000, stats));
      assert.ok(!achievementService.evaluateRequirement('points_total', 1001, stats));
    });

    it('evaluates plant_stage requirement', () => {
      const stats = { maxPlantStage: 2 };
      assert.ok(achievementService.evaluateRequirement('plant_stage', 2, stats));
      assert.ok(!achievementService.evaluateRequirement('plant_stage', 3, stats));
    });

    it('evaluates has_stake requirement when true', () => {
      assert.ok(achievementService.evaluateRequirement('has_stake', 1, { hasInitialized: true, totalStaked: 0 }));
      assert.ok(achievementService.evaluateRequirement('has_stake', 1, { hasInitialized: false, totalStaked: 100 }));
    });

    it('evaluates has_stake requirement when false', () => {
      assert.ok(!achievementService.evaluateRequirement('has_stake', 1, { hasInitialized: false, totalStaked: 0 }));
    });

    it('evaluates total_staked requirement', () => {
      const stats = { totalStaked: 500 };
      assert.ok(achievementService.evaluateRequirement('total_staked', 500, stats));
      assert.ok(!achievementService.evaluateRequirement('total_staked', 501, stats));
    });

    it('evaluates total_claimed requirement', () => {
      const stats = { totalClaimed: 10 };
      assert.ok(achievementService.evaluateRequirement('total_claimed', 10, stats));
      assert.ok(!achievementService.evaluateRequirement('total_claimed', 11, stats));
    });

    it('returns false for unknown requirement type', () => {
      assert.ok(!achievementService.evaluateRequirement('unknown_type', 1, {}));
    });
  });

  describe('Progress Tracking (static tests)', () => {
    it('calculates progress for streak_days', () => {
      const stats = { streakDays: 5 };
      assert.strictEqual(achievementService.getProgress('streak_days', 7, stats), 5);
    });

    it('caps progress at requirement value', () => {
      const stats = { streakDays: 100 };
      assert.strictEqual(achievementService.getProgress('streak_days', 30, stats), 30);
    });

    it('calculates progress for workouts_total', () => {
      const stats = { totalWorkouts: 72 };
      assert.strictEqual(achievementService.getProgress('workouts_total', 100, stats), 72);
    });

    it('calculates progress for points_total', () => {
      const stats = { totalPointsEarned: 500 };
      assert.strictEqual(achievementService.getProgress('points_total', 1000, stats), 500);
    });

    it('calculates progress for plant_stage', () => {
      const stats = { maxPlantStage: 2 };
      assert.strictEqual(achievementService.getProgress('plant_stage', 4, stats), 2);
    });

    it('calculates progress for total_staked', () => {
      const stats = { totalStaked: 250 };
      assert.strictEqual(achievementService.getProgress('total_staked', 500, stats), 250);
    });

    it('returns 0 for unknown requirement type', () => {
      assert.strictEqual(achievementService.getProgress('unknown_type', 100, {}), 0);
    });
  });

  describe('Badge Awarding', () => {
    const testAddress = '0x00000000000000000000000000000000000000cc';

    after(() => {
      const { closeDb } = require('../achievementService');
      try { closeDb(); } catch {}
    });

    it('awards a badge to a user', () => {
      const awarded = achievementService.awardBadge(testAddress, 1);
      assert.ok(awarded);
    });

    it('returns existing badges', () => {
      const badges = achievementService.getExistingBadges(testAddress);
      assert.strictEqual(badges.length, 1);
      assert.strictEqual(badges[0].badgeId, 1);
    });

    it('prevents duplicate badge awards', () => {
      const awarded = achievementService.awardBadge(testAddress, 1);
      assert.ok(!awarded);
    });

    it('still has exactly one badge entry after dup attempt', () => {
      const badges = achievementService.getExistingBadges(testAddress);
      assert.strictEqual(badges.length, 1);
    });

    it('can award multiple badges', () => {
      achievementService.awardBadge(testAddress, 2);
      achievementService.awardBadge(testAddress, 3);
      const badges = achievementService.getExistingBadges(testAddress);
      assert.strictEqual(badges.length, 3);
    });

    it('returns recent achievements in descending order', () => {
      const recent = achievementService.getRecentAchievements(testAddress, 2);
      assert.strictEqual(recent.length, 2);
      const t1 = new Date(recent[0].unlockedAt).getTime();
      const t2 = new Date(recent[1].unlockedAt).getTime();
      assert.ok(t1 >= t2, 'Recent badges should be ordered by newest first');
    });
  });
});
