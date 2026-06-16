const { ethers } = require('ethers');
const { openStreakDb } = require('./db/streak-db');

const db = openStreakDb();

function normalizeAddress(address) {
  return ethers.getAddress(address).toLowerCase();
}

function toUtcDay(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toIsoTimestamp(timestamp = Date.now()) {
  return new Date(timestamp).toISOString();
}

function formatStreakRow(row) {
  if (!row) return null;
  return {
    walletAddress: row.walletAddress,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastActivityDate: row.lastActivityDate || null,
    streakStartDate: row.streakStartDate || null,
    totalDaysActive: row.totalDaysActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getStreakRow(walletAddress) {
  const normalized = normalizeAddress(walletAddress);
  return db.prepare('SELECT * FROM streak_profiles WHERE walletAddress = ?').get(normalized);
}

function getStreak(walletAddress) {
  const row = getStreakRow(walletAddress);
  return formatStreakRow(row);
}

function daysBetweenUtcDays(today, previousDay) {
  return Math.round((Date.parse(today) - Date.parse(previousDay)) / 86_400_000);
}

function recordVerifiedActivity(walletAddress, timestamp = Date.now()) {
  const normalized = normalizeAddress(walletAddress);
  const today = toUtcDay(timestamp);
  const nowIso = toIsoTimestamp(timestamp);
  const existing = getStreakRow(normalized);

  if (!existing) {
    db.prepare(
      `INSERT INTO streak_profiles (
         walletAddress,
         currentStreak,
         longestStreak,
         lastActivityDate,
         streakStartDate,
         totalDaysActive,
         createdAt,
         updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(normalized, 1, 1, today, today, 1, nowIso, nowIso);

    return getStreak(normalized);
  }

  if (existing.lastActivityDate === today) {
    return formatStreakRow(existing);
  }

  let currentStreak = 1;
  let streakStartDate = today;
  const longestStreak = existing.longestStreak;

  if (existing.lastActivityDate) {
    const diffDays = daysBetweenUtcDays(today, existing.lastActivityDate);
    if (diffDays === 1) {
      currentStreak = existing.currentStreak + 1;
      streakStartDate = existing.streakStartDate || today;
    } else if (diffDays > 1) {
      currentStreak = 1;
      streakStartDate = today;
    } else {
      return formatStreakRow(existing);
    }
  }

  const newLongest = currentStreak > longestStreak ? currentStreak : longestStreak;
  const totalDaysActive = existing.totalDaysActive + 1;

  db.prepare(
    `UPDATE streak_profiles SET
       currentStreak = ?,
       longestStreak = ?,
       lastActivityDate = ?,
       streakStartDate = ?,
       totalDaysActive = ?,
       updatedAt = ?
     WHERE walletAddress = ?`
  ).run(currentStreak, newLongest, today, streakStartDate, totalDaysActive, nowIso, normalized);

  return getStreak(normalized);
}

function closeDb() {
  db.close();
}

module.exports = {
  getStreak,
  recordVerifiedActivity,
  closeDb,
};
