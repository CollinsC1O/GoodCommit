const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const TEST_DB_PATH = path.resolve(__dirname, 'tmp-achievement-api.db');

before(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  process.env.STREAK_DB_PATH = TEST_DB_PATH;
});

after(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe('Achievement API', () => {
  let app;
  let achievementService;

  before(() => {
    achievementService = require('../achievementService');
    const server = require('../server');
    app = server.app;
  });

  describe('GET /api/achievements/:address', () => {
    it('returns achievement data for a wallet address', async () => {
      const res = await request(app)
        .get('/api/achievements/0x00000000000000000000000000000000000000dd');

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.unlocked));
      assert.ok(Array.isArray(res.body.locked));
      assert.ok(res.body.summary);
      assert.strictEqual(typeof res.body.summary.totalBadges, 'number');
      assert.strictEqual(typeof res.body.summary.totalPossible, 'number');
    });

    it('includes progress data for locked badges', async () => {
      const res = await request(app)
        .get('/api/achievements/0x00000000000000000000000000000000000000dd');

      assert.strictEqual(res.status, 200);
      const locked = res.body.locked;
      if (locked.length > 0) {
        const badge = locked[0];
        assert.ok('progress' in badge);
        assert.ok('total' in badge);
        assert.ok('percentage' in badge);
        assert.ok('isUnlocked' in badge);
        assert.strictEqual(badge.isUnlocked, false);
      }
    });

    it('returns unlocked badges for users who earned some', async () => {
      achievementService.awardBadge(
        '0x00000000000000000000000000000000000000ee',
        1
      );
      achievementService.awardBadge(
        '0x00000000000000000000000000000000000000ee',
        2
      );

      const res = await request(app)
        .get('/api/achievements/0x00000000000000000000000000000000000000ee');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.summary.totalBadges, 2);
      assert.ok(res.body.unlocked.length > 0);
    });

    it('returns summary with completion percentage', async () => {
      const res = await request(app)
        .get('/api/achievements/0x00000000000000000000000000000000000000dd');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(typeof res.body.summary.completionPercentage, 'number');
      assert.ok(res.body.summary.completionPercentage >= 0);
      assert.ok(res.body.summary.completionPercentage <= 100);
    });

    it('rejects invalid wallet address', async () => {
      const res = await request(app)
        .get('/api/achievements/0xinvalid');

      assert.strictEqual(res.status, 400);
    });
  });

  describe('GET /api/achievements/recent/:address', () => {
    const testAddress = '0x00000000000000000000000000000000000000ff';

    before(() => {
      achievementService.awardBadge(testAddress, 1);
      achievementService.awardBadge(testAddress, 2);
      achievementService.awardBadge(testAddress, 3);
    });

    it('returns recent achievements', async () => {
      const res = await request(app)
        .get(`/api/achievements/recent/${testAddress}`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.recent));
      assert.ok(res.body.recent.length > 0);
    });

    it('returns limited number of recent achievements', async () => {
      const res = await request(app)
        .get(`/api/achievements/recent/${testAddress}?limit=2`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.recent.length <= 2);
    });

    it('includes badge metadata in recent achievements', async () => {
      const res = await request(app)
        .get(`/api/achievements/recent/${testAddress}?limit=1`);

      assert.strictEqual(res.status, 200);
      const badge = res.body.recent[0];
      assert.ok(badge.slug);
      assert.ok(badge.title);
      assert.ok(badge.icon);
      assert.ok(badge.rarity);
      assert.ok(badge.unlockedAt);
    });

    it('rejects invalid wallet address for recent', async () => {
      const res = await request(app)
        .get('/api/achievements/recent/0xinvalid');

      assert.strictEqual(res.status, 400);
    });
  });
});
