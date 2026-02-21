/**
 * Short-lived send tokens for browser-based secret composition.
 * A send token authorizes a sender to compose and encrypt a secret
 * for a specific recipient via the web UI.
 */

import crypto from 'crypto';
import { getDb } from './db';

export interface SendTokenRecord {
  token: string;
  senderParty: string;
  senderSlackId: string;
  recipientParty: string;
  recipientSlackId: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

interface RawRow {
  token: string;
  sender_party: string;
  sender_slack_id: string;
  recipient_party: string;
  recipient_slack_id: string;
  label: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

function rowToRecord(row: RawRow): SendTokenRecord {
  return {
    token: row.token,
    senderParty: row.sender_party,
    senderSlackId: row.sender_slack_id,
    recipientParty: row.recipient_party,
    recipientSlackId: row.recipient_slack_id,
    label: row.label,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

const SEND_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Create a send token with 10-minute expiry.
 * Returns a 64-char hex string (256 bits of entropy).
 */
export function createSendToken(
  senderParty: string,
  senderSlackId: string,
  recipientParty: string,
  recipientSlackId: string,
  label: string
): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEND_TOKEN_TTL_MS);
  const db = getDb();

  db.prepare(`
    INSERT INTO send_tokens (token, sender_party, sender_slack_id, recipient_party, recipient_slack_id, label, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(token, senderParty, senderSlackId, recipientParty, recipientSlackId, label, now.toISOString(), expiresAt.toISOString());

  return token;
}

/**
 * Peek at a send token without consuming it (for GET /compose page).
 * Returns null if token is invalid, expired, or already consumed.
 */
export function getSendTokenInfo(token: string): SendTokenRecord | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM send_tokens
    WHERE token = ?
      AND consumed_at IS NULL
  `).get(token) as RawRow | undefined;

  if (!row) return null;

  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    return null;
  }

  return rowToRecord(row);
}

/**
 * Atomically consume a send token. Returns the record if valid,
 * or null if invalid, expired, or already consumed.
 */
export function consumeSendToken(token: string): SendTokenRecord | null {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.transaction(() => {
    const row = db.prepare(`
      SELECT * FROM send_tokens
      WHERE token = ?
        AND consumed_at IS NULL
    `).get(token) as RawRow | undefined;

    if (!row) return null;

    // Check expiry
    if (new Date(row.expires_at) < new Date()) {
      return null;
    }

    // Mark as consumed
    db.prepare(`UPDATE send_tokens SET consumed_at = ? WHERE token = ?`).run(now, token);

    return rowToRecord(row);
  })();

  return result;
}
