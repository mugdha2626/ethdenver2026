/**
 * Slack user ID <-> Canton party mapping
 * Persisted in SQLite for durability across restarts
 */

import { getDb } from './db';

export interface PartyMapping {
  slackUserId: string;
  slackUsername: string;
  cantonParty: string;
  registeredAt: string;
}

interface RawRow {
  slack_user_id: string;
  slack_username: string;
  canton_party: string;
  registered_at: string;
}

function rowToMapping(row: RawRow): PartyMapping {
  return {
    slackUserId: row.slack_user_id,
    slackUsername: row.slack_username,
    cantonParty: row.canton_party,
    registeredAt: row.registered_at,
  };
}

/**
 * Save a new party mapping
 */
export function savePartyMapping(mapping: PartyMapping): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO party_mapping (slack_user_id, slack_username, canton_party, registered_at)
     VALUES (?, ?, ?, ?)`
  ).run(mapping.slackUserId, mapping.slackUsername, mapping.cantonParty, mapping.registeredAt);
}

/**
 * Look up a Canton party by Slack user ID
 */
export function getPartyBySlackId(slackUserId: string): PartyMapping | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM party_mapping WHERE slack_user_id = ?')
    .get(slackUserId) as RawRow | undefined;
  return row ? rowToMapping(row) : null;
}

/**
 * Look up a Slack user by Canton party
 */
export function getSlackIdByParty(cantonParty: string): PartyMapping | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM party_mapping WHERE canton_party = ?')
    .get(cantonParty) as RawRow | undefined;
  return row ? rowToMapping(row) : null;
}

/**
 * Look up a party mapping by Slack username
 */
export function getPartyByUsername(username: string): PartyMapping | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM party_mapping WHERE LOWER(slack_username) = LOWER(?)')
    .get(username) as RawRow | undefined;
  return row ? rowToMapping(row) : null;
}

/**
 * Get all registered party mappings
 */
export function getAllMappings(): PartyMapping[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM party_mapping').all() as RawRow[];
  return rows.map(rowToMapping);
}

/**
 * Clear all party mappings (e.g., when Canton sandbox is restarted)
 */
export function clearAllMappings(): void {
  const db = getDb();
  db.prepare('DELETE FROM party_mapping').run();
}
