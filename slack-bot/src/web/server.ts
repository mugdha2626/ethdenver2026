/**
 * Express web server for zero-knowledge secret viewing.
 * Runs on a separate port from Slack's Socket Mode connection.
 *
 * This server NEVER sees the secret. It validates the one-time token,
 * generates a short-lived read-only JWT, and redirects the browser
 * to Canton's static viewer page where the secret is fetched client-side.
 */

import express from 'express';
import { consumeViewToken } from '../stores/view-tokens';
import { getPackageId } from '../services/canton';
import { generateViewerJwt } from '../utils/jwt';
import { renderErrorPage, renderUnfurlPage } from './template';

const TOKEN_REGEX = /^[a-f0-9]{64}$/;
const CANTON_VIEWER_BASE_URL = process.env.CANTON_VIEWER_BASE_URL || 'http://localhost:7575';

export function startWebServer(port: number): void {
  const app = express();

  // Security headers on all responses
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
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

    // Build the template ID for the query
    const pkgId = getPackageId();
    if (!pkgId) {
      res.status(500).send(renderErrorPage(
        'Server Error',
        'Package ID not available. The Canton ledger may not be initialized yet.'
      ));
      return;
    }

    const templateId = `${pkgId}:Main:SecretTransfer`;

    // Generate a short-lived read-only JWT (60 seconds, no write permissions)
    const viewerJwt = generateViewerJwt(record.canton_party);

    // Build redirect URL with parameters in the fragment (never sent to servers)
    const fragment = [
      'jwt=' + encodeURIComponent(viewerJwt),
      'cid=' + encodeURIComponent(record.contract_id),
      'tid=' + encodeURIComponent(templateId),
      'party=' + encodeURIComponent(record.canton_party),
    ].join('&');

    const viewerUrl = `${CANTON_VIEWER_BASE_URL}/viewer/index.html#${fragment}`;

    res.redirect(302, viewerUrl);
  });

  app.listen(port, () => {
    console.log(`  Web viewer:  http://localhost:${port}`);
  });
}
