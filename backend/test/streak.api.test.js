const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const TEST_DB_PATH = path.resolve(__dirname, 'tmp-streak-api.db');

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

describe('Streak API', () => {
  let app;
  let streakService;

  before(() => {
    streakService = require('../streakService');
    const server = require('../server');
    app = server.app;
  });

  it('returns empty streak summary for unknown wallet', async () => {
    const res = await request(app).get('/api/streak/0x00000000000000000000000000000000000000aa');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.currentStreak, 0);
    assert.strictEqual(res.body.longestStreak, 0);
    assert.strictEqual(res.body.totalDaysActive, 0);
    assert.strictEqual(res.body.lastActivityDate, null);
    assert.strictEqual(res.body.streakStartDate, null);
  });

  it('returns streak profile after verified activity', async () => {
    streakService.recordVerifiedActivity('0x00000000000000000000000000000000000000bb', Date.UTC(2026, 5, 13, 12, 0, 0));
    const res = await request(app).get('/api/streak/0x00000000000000000000000000000000000000bb');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.currentStreak, 1);
    assert.strictEqual(res.body.longestStreak, 1);
    assert.strictEqual(res.body.lastActivityDate, '2026-06-13');
  });
});
