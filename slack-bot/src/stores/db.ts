/**
 * SQLite database setup using better-sqlite3
 * Stores party mappings locally
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/cc.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dir = path.dirname(DB_PATH);
    const fs = require('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables(db);
  }
  return db;
}

function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS party_mapping (
      slack_user_id TEXT PRIMARY KEY,
      slack_username TEXT NOT NULL,
      canton_party TEXT NOT NULL,
      registered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS view_tokens (
      token TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      canton_party TEXT NOT NULL,
      slack_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      consumed_at TEXT,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_view_tokens_contract ON view_tokens(contract_id);

    CREATE TABLE IF NOT EXISTS encryption_keys (
      canton_party TEXT PRIMARY KEY,
      slack_user_id TEXT NOT NULL,
      public_key_spki TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS send_tokens (
      token TEXT PRIMARY KEY,
      sender_party TEXT NOT NULL,
      sender_slack_id TEXT NOT NULL,
      recipient_party TEXT NOT NULL,
      recipient_slack_id TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
