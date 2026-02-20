/**
 * JWT generation for Canton JSON API authentication
 *
 * v1 (sandbox): Party-specific JWTs with Daml ledger claims
 * v2 (DevNet):  Admin JWT with participant_admin subject
 *
 * Set CANTON_AUTH_TOKEN to use a pre-issued token (skips generation).
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sandbox-secret';

/**
 * Generate a JWT token for Canton JSON API v1
 * Includes actAs/readAs claims scoped to a specific party
 */
export function generateJwt(party: string): string {
  const payload = {
    sub: party,
    'https://daml.com/ledger-api': {
      ledgerId: 'sandbox',
      applicationId: 'confidential-connect',
      actAs: [party],
      readAs: [party],
    },
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '24h',
  });
}

/**
 * Generate an admin JWT token for Canton v2 API
 * v2 specifies actAs/readAs per-request, so the JWT only authenticates the app
 */
export function generateAdminToken(): string {
  const payload = {
    sub: 'participant_admin',
    scope: 'daml_ledger_api',
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '24h',
  });
}
