/**
 * Cryptographic utilities for secret hashing
 * Uses SHA-256 with random salt to create commitments
 */

import { randomBytes, createHash } from 'crypto';

/**
 * Generate a random 32-byte salt
 */
export function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Compute SHA-256(secret + salt) to create a commitment hash
 * The commitment can be stored on-ledger without revealing the secret
 */
export function computeCommitment(secret: string, salt: string): string {
  return createHash('sha256')
    .update(secret + salt)
    .digest('hex');
}

/**
 * Verify that a secret matches a previously created commitment
 */
export function verifyCommitment(
  secret: string,
  salt: string,
  expectedCommitment: string
): boolean {
  const computed = computeCommitment(secret, salt);
  // Constant-time comparison to prevent timing attacks
  if (computed.length !== expectedCommitment.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ expectedCommitment.charCodeAt(i);
  }
  return result === 0;
}
