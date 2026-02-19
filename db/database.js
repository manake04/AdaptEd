const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbPath = process.env.DB_PATH || './db/adapted.db';
const absoluteDbPath = path.resolve(__dirname, '..', dbPath);

// Ensure db directory exists
const fs = require('fs');
const dbDir = path.dirname(absoluteDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(absoluteDbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== Create Tables =====
db.exec(`
  -- Users table (session-based)
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- User preferences
  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    theme TEXT DEFAULT 'dark',
    font_size TEXT DEFAULT 'normal',
    reduce_motion INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Transcription history
  CREATE TABLE IF NOT EXISTS transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    language TEXT DEFAULT 'en-US',
    duration_seconds REAL DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Saved summaries
  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    original_text TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    original_word_count INTEGER DEFAULT 0,
    summary_word_count INTEGER DEFAULT 0,
    reduction_percent REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Analytics events
  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    event_type TEXT NOT NULL,
    feature TEXT NOT NULL,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_preferences_user ON preferences(user_id);
  CREATE INDEX IF NOT EXISTS idx_transcriptions_user ON transcriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_summaries_user ON summaries(user_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_feature ON analytics(feature);
  CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics(created_at);
`);

console.log('✅ Database initialized successfully');

module.exports = db;
