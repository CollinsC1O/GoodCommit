const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = path.resolve(__dirname, 'tmp-streak.db');

before(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  process.env.STREAK_DB_PATH = TEST_DB_PATH;
});

after(() => {
  const { closeDb } = require('../streakService');
  closeDb();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe('Streak Service', () => {
  let streakService;

  before(() => {
    streakService = require('../streakService');
  });

  it('creates a new streak for first verified activity', () => {
    const profile = streakService.recordVerifiedActivity('0x0000000000000000000000000000000000000001', Date.UTC(2026, 5, 1, 12, 0, 0));

    assert.strictEqual(profile.currentStreak, 1);
    assert.strictEqual(profile.longestStreak, 1);
    assert.strictEqual(profile.totalDaysActive, 1);
    assert.strictEqual(profile.lastActivityDate, '2026-06-01');
    assert.strictEqual(profile.streakStartDate, '2026-06-01');
  });

  it('does not increase streak for multiple activities on the same UTC day', () => {
    const profile = streakService.recordVerifiedActivity('0x0000000000000000000000000000000000000001', Date.UTC(2026, 5, 1, 20, 0, 0));

    assert.strictEqual(profile.currentStreak, 1);
    assert.strictEqual(profile.totalDaysActive, 1);
  });

  it('increases streak on consecutive UTC day activity', () => {
    const profile = streakService.recordVerifiedActivity('0x0000000000000000000000000000000000000001', Date.UTC(2026, 5, 2, 10, 0, 0));

    assert.strictEqual(profile.currentStreak, 2);
    assert.strictEqual(profile.longestStreak, 2);
    assert.strictEqual(profile.totalDaysActive, 2);
    assert.strictEqual(profile.lastActivityDate, '2026-06-02');
  });

  it('resets streak after a missed UTC day', () => {
    const profile = streakService.recordVerifiedActivity('0x0000000000000000000000000000000000000001', Date.UTC(2026, 5, 4, 11, 0, 0));

    assert.strictEqual(profile.currentStreak, 1);
    assert.strictEqual(profile.longestStreak, 2);
    assert.strictEqual(profile.totalDaysActive, 3);
    assert.strictEqual(profile.lastActivityDate, '2026-06-04');
    assert.strictEqual(profile.streakStartDate, '2026-06-04');
  });

  it('updates longest streak when current streak grows', () => {
    streakService.recordVerifiedActivity('0x0000000000000000000000000000000000000001', Date.UTC(2026, 5, 5, 9, 0, 0));
    streakService.recordVerifiedActivity('0x0000000000000000000000000000000000000001', Date.UTC(2026, 5, 6, 9, 0, 0));
    const profile = streakService.recordVerifiedActivity('0x0000000000000000000000000000000000000001', Date.UTC(2026, 5, 7, 9, 0, 0));

    assert.strictEqual(profile.currentStreak, 3);
    assert.strictEqual(profile.longestStreak, 3);
    assert.strictEqual(profile.totalDaysActive, 6);
  });

  it('handles UTC day boundary correctly across midnight', () => {
    const address = '0x0000000000000000000000000000000000000002';
    const beforeMidnight = Date.UTC(2026, 5, 10, 23, 59, 0); // 2026-06-10 23:59 UTC
    const afterMidnight = Date.UTC(2026, 5, 11, 0, 1, 0);    // 2026-06-11 00:01 UTC

    const profileOne = streakService.recordVerifiedActivity(address, beforeMidnight);
    assert.strictEqual(profileOne.currentStreak, 1);
    assert.strictEqual(profileOne.lastActivityDate, '2026-06-10');

    const profileTwo = streakService.recordVerifiedActivity(address, afterMidnight);
    assert.strictEqual(profileTwo.currentStreak, 2);
    assert.strictEqual(profileTwo.lastActivityDate, '2026-06-11');
  });

  it('returns 0 values for users without streak data', () => {
    const profile = streakService.getStreak('0x00000000000000000000000000000000000000aa');
    assert.strictEqual(profile, null);
  });

  it('ignores duplicate submissions on the same UTC day', () => {
    const address = '0x00000000000000000000000000000000000000bb';
    const first = streakService.recordVerifiedActivity(address, Date.UTC(2026, 5, 12, 8, 0, 0));
    const duplicate = streakService.recordVerifiedActivity(address, Date.UTC(2026, 5, 12, 18, 0, 0));

    assert.strictEqual(first.currentStreak, 1);
    assert.strictEqual(duplicate.currentStreak, 1);
    assert.strictEqual(duplicate.totalDaysActive, 1);
  });
});
