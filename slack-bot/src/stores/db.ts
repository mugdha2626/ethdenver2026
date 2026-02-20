/**
 * SQLite database setup using better-sqlite3
 * Stores salts and party mappings locally
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

    CREATE TABLE IF NOT EXISTS salt_store (
      owner_party TEXT NOT NULL,
      label TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (owner_party, label)
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
