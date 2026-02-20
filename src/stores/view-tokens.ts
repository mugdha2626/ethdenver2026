/**
 * One-time view token management for secret viewing via web UI.
 * Tokens are stored in SQLite and consumed atomically on first use.
 */

import crypto from 'crypto';
import { getDb } from './db';

export interface ViewTokenRecord {
  token: string;
  contract_id: string;
  canton_party: string;
  slack_user_id: string;
  created_at: string;
  expires_at: string | null;
  consumed_at: string | null;
  revoked: number;
}

/**
 * Generate a one-time view token for a secret contract.
 * Returns a 64-char hex string (256 bits of entropy).
 */
export function createViewToken(
  contractId: string,
  cantonParty: string,
  slackUserId: string,
  secretExpiresAt: string | null
): string {
  const token = crypto.randomBytes(32).toString('hex');
  const db = getDb();

  db.prepare(`
    INSERT INTO view_tokens (token, contract_id, canton_party, slack_user_id, created_at, expires_at, revoked)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(token, contractId, cantonParty, slackUserId, new Date().toISOString(), secretExpiresAt);

  return token;
}

/**
 * Atomically consume a view token. Returns the token record if valid,
 * or null if the token is invalid, expired, already consumed, or revoked.
 */
export function consumeViewToken(token: string): ViewTokenRecord | null {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.transaction(() => {
    const row = db.prepare(`
      SELECT * FROM view_tokens
      WHERE token = ?
        AND consumed_at IS NULL
        AND revoked = 0
    `).get(token) as ViewTokenRecord | undefined;

    if (!row) return null;

    // Check if the secret itself has expired
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return null;
    }

    // Mark as consumed
    db.prepare(`UPDATE view_tokens SET consumed_at = ? WHERE token = ?`).run(now, token);

    return row;
  })();

  return result;
}

/**
 * Revoke all unconsumed tokens for a contract (called on acknowledge/expiry).
 */
export function revokeTokensForContract(contractId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE view_tokens SET revoked = 1
    WHERE contract_id = ? AND consumed_at IS NULL AND revoked = 0
  `).run(contractId);
}

/**
 * Purge old token rows (consumed or revoked more than 24 hours ago).
 */
export function purgeExpiredTokens(): void {
  const db = getDb();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    DELETE FROM view_tokens
    WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
       OR (revoked = 1 AND created_at < ?)
       OR (expires_at IS NOT NULL AND expires_at < ?)
  `).run(cutoff, cutoff, cutoff);
}
