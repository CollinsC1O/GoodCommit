const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.resolve(__dirname, '..', 'data', 'streaks.sqlite');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function openStreakDb() {
  const dbPath = process.env.STREAK_DB_PATH
    ? path.resolve(process.env.STREAK_DB_PATH)
    : DEFAULT_DB_PATH;

  ensureDirectory(path.dirname(dbPath));

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS streak_profiles (
      walletAddress TEXT PRIMARY KEY,
      currentStreak INTEGER NOT NULL DEFAULT 0,
      longestStreak INTEGER NOT NULL DEFAULT 0,
      lastActivityDate TEXT,
      streakStartDate TEXT,
      totalDaysActive INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run();

  return db;
}

module.exports = {
  openStreakDb,
};
