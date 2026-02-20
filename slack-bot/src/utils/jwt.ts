/**
 * JWT generation for Canton JSON API authentication
 * Canton sandbox with --allow-insecure-tokens accepts any JWT
 * with the right structure. No signing key needed for dev.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sandbox-secret';

/**
 * Generate a JWT token for Canton JSON API
 * The token includes actAs and readAs claims for the given party
 */
export function generateJwt(party: string): string {
  // Canton JSON API expects this specific payload structure
  // See: https://docs.daml.com/json-api/index.html#auth
  const payload = {
    // Standard JWT claims
    sub: party,
    // Daml-specific claims
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
 * Generate a JWT with actAs rights for multiple parties
 * Used when the bot needs to act on behalf of the operator
 */
export function generateOperatorJwt(): string {
  return generateJwt(process.env.CANTON_OPERATOR_PARTY || 'operator');
}
