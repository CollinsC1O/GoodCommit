const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.resolve(__dirname, '..', 'data', 'streaks.sqlite');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function openBadgeDb() {
  const dbPath = process.env.STREAK_DB_PATH
    ? path.resolve(process.env.STREAK_DB_PATH)
    : DEFAULT_DB_PATH;

  ensureDirectory(path.dirname(dbPath));

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS badge_definitions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      slug            TEXT NOT NULL UNIQUE,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      category        TEXT NOT NULL,
      icon            TEXT NOT NULL,
      rarity          TEXT NOT NULL DEFAULT 'common',
      requirementType TEXT NOT NULL,
      requirementValue REAL NOT NULL,
      sortOrder       INTEGER NOT NULL DEFAULT 0,
      rewardType      TEXT,
      rewardValue     REAL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      walletAddress   TEXT NOT NULL,
      badgeId         INTEGER NOT NULL,
      unlockedAt      TEXT NOT NULL,
      FOREIGN KEY (badgeId) REFERENCES badge_definitions(id),
      UNIQUE(walletAddress, badgeId)
    )
  `).run();

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_user_badges_wallet
    ON user_badges(walletAddress)
  `).run();

  return db;
}

module.exports = {
  openBadgeDb,
};
