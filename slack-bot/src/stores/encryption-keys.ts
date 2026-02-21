/**
 * Public encryption key storage for E2E encryption.
 * Stores SPKI-encoded public keys in SQLite, keyed by Canton party.
 * Private keys never leave the user's browser (stored in IndexedDB).
 */

import { getDb } from './db';

export interface EncryptionKeyRecord {
  cantonParty: string;
  slackUserId: string;
  publicKeySpki: string;
  createdAt: string;
}

interface RawRow {
  canton_party: string;
  slack_user_id: string;
  public_key_spki: string;
  created_at: string;
}

function rowToRecord(row: RawRow): EncryptionKeyRecord {
  return {
    cantonParty: row.canton_party,
    slackUserId: row.slack_user_id,
    publicKeySpki: row.public_key_spki,
    createdAt: row.created_at,
  };
}

export function savePublicKey(record: EncryptionKeyRecord): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO encryption_keys (canton_party, slack_user_id, public_key_spki, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(record.cantonParty, record.slackUserId, record.publicKeySpki, record.createdAt);
}

export function getPublicKeyByParty(cantonParty: string): EncryptionKeyRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM encryption_keys WHERE canton_party = ?')
    .get(cantonParty) as RawRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function hasEncryptionKeys(cantonParty: string): boolean {
  return getPublicKeyByParty(cantonParty) !== null;
}

export function clearAllEncryptionKeys(): void {
  const db = getDb();
  db.prepare('DELETE FROM encryption_keys').run();
}
