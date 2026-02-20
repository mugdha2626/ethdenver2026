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
    .get(slackUserId) as PartyMapping | undefined;
  return row ?? null;
}

/**
 * Look up a Slack user by Canton party
 */
export function getSlackIdByParty(cantonParty: string): PartyMapping | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM party_mapping WHERE canton_party = ?')
    .get(cantonParty) as PartyMapping | undefined;
  return row ?? null;
}

/**
 * Get all registered party mappings
 */
export function getAllMappings(): PartyMapping[] {
  const db = getDb();
  return db.prepare('SELECT * FROM party_mapping').all() as PartyMapping[];
}
