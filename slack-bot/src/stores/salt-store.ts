/**
 * Salt storage for secret commitments
 * Salts are stored locally (not on Canton) to enable re-verification
 */

import { getDb } from './db';

export interface SaltEntry {
  ownerParty: string;
  label: string;
  salt: string;
  createdAt: string;
}

/**
 * Store a salt for a secret commitment
 */
export function saveSalt(entry: SaltEntry): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO salt_store (owner_party, label, salt, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(entry.ownerParty, entry.label, entry.salt, entry.createdAt);
}

/**
 * Retrieve the salt for a given party and label
 */
export function getSalt(ownerParty: string, label: string): SaltEntry | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM salt_store WHERE owner_party = ? AND label = ?')
    .get(ownerParty, label) as
    | { owner_party: string; label: string; salt: string; created_at: string }
    | undefined;

  if (!row) return null;
  return {
    ownerParty: row.owner_party,
    label: row.label,
    salt: row.salt,
    createdAt: row.created_at,
  };
}

/**
 * Delete a salt entry (when revoking a commitment)
 */
export function deleteSalt(ownerParty: string, label: string): void {
  const db = getDb();
  db.prepare('DELETE FROM salt_store WHERE owner_party = ? AND label = ?').run(
    ownerParty,
    label
  );
}
