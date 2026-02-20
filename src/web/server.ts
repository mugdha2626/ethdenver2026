/**
 * Express web server for zero-knowledge secret viewing.
 * Runs on a separate port from Slack's Socket Mode connection.
 */

import express from 'express';
import { consumeViewToken } from '../stores/view-tokens';
import { queryContracts } from '../services/canton';
import { renderSecretPage, renderErrorPage, renderUnfurlPage } from './template';

const TOKEN_REGEX = /^[a-f0-9]{64}$/;

export function startWebServer(port: number): void {
  const app = express();

  // Security headers on all responses
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    next();
  });

  app.get('/secret/:token', async (req, res) => {
    const { token } = req.params;

    // Validate token format
    if (!TOKEN_REGEX.test(token)) {
      res.status(400).send(renderErrorPage('Invalid Link', 'This link is malformed.'));
      return;
    }

    // Block Slack's unfurl bot — it fetches links to generate previews.
    // If we don't block this, Slack would consume the one-time token before the user clicks.
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('Slackbot')) {
      res.status(200).send(renderUnfurlPage());
      return;
    }

    // Atomically consume the token
    const record = consumeViewToken(token);
    if (!record) {
      res.status(410).send(renderErrorPage(
        'Link Expired or Already Used',
        'This one-time link has already been used, has expired, or was revoked. Ask the sender to share the secret again.'
      ));
      return;
    }

    try {
      // Fetch the secret from Canton using the recipient's party
      const transfers = await queryContracts(
        record.canton_party,
        'SecretTransfer',
        { recipient: record.canton_party }
      );

      const transfer = transfers.find((t) => t.contractId === record.contract_id);
      if (!transfer) {
        res.status(404).send(renderErrorPage(
          'Secret Not Found',
          'The secret may have been acknowledged or expired on the Canton ledger.'
        ));
        return;
      }

      const payload = transfer.payload as Record<string, any>;

      res.status(200).send(renderSecretPage({
        label: payload.label,
        description: payload.description,
        secret: payload.encryptedSecret,
        senderParty: payload.sender,
        sentAt: payload.sentAt,
        expiresAt: payload.expiresAt || null,
      }));
    } catch (err) {
      console.error('[web] Error fetching secret from Canton:', err);
      res.status(500).send(renderErrorPage(
        'Server Error',
        'Could not retrieve the secret. Please try again later.'
      ));
    }
  });

  app.listen(port, () => {
    console.log(`  Web viewer:  http://localhost:${port}`);
  });
}
