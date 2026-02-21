/**
 * Express web server for zero-knowledge secret viewing and E2E encryption flows.
 * Runs on a separate port from Slack's Socket Mode connection.
 *
 * This server NEVER sees plaintext secrets. It handles:
 * - One-time view token validation + JWT generation + redirect to Canton viewer
 * - Key setup page (browser generates RSA keypair, POSTs public key)
 * - Compose page (browser encrypts secret, POSTs ciphertext)
 * - API endpoints for public key storage and send token consumption
 * - Reverse proxy to Canton JSON API (so only one port needs to be exposed)
 * - Static serving of the Canton viewer HTML (for multi-device LAN testing)
 */

import express from 'express';
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import type { App } from '@slack/bolt';
import { consumeViewToken, createViewToken } from '../stores/view-tokens';
import { createContract, getOperatorParty, getPackageId } from '../services/canton';
import { generateViewerJwt } from '../utils/jwt';
import { renderErrorPage, renderUnfurlPage } from './template';
import { renderSetupKeysPage } from './setup-keys-template';
import { renderComposePage } from './compose-template';
import { savePublicKey, getPublicKeyByParty } from '../stores/encryption-keys';
import { getPartyBySlackId } from '../stores/party-mapping';
import { getSendTokenInfo, consumeSendToken } from '../stores/send-tokens';
import { trackSecret } from '../stores/secret-timers';
import { header, divider, inboxItemWithLink, context } from '../utils/slack-blocks';

const TOKEN_REGEX = /^[a-f0-9]{64}$/;
const CANTON_API_URL = process.env.CANTON_JSON_API_URL || 'http://localhost:7575';
const cantonUrl = new URL(CANTON_API_URL);

export function startWebServer(port: number, slackApp: App): void {
  const app = express();

  // Security headers on all responses
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  // --- Static viewer files (served from Express instead of requiring Canton access) ---
  const viewerDir = path.resolve(__dirname, '../../../daml/viewer');
  app.use('/viewer', express.static(viewerDir));

  // --- Canton JSON API reverse proxy (/v1/*) ---
  // Must be BEFORE express.json() so we can forward raw request bodies.
  // This allows the viewer (served from Express) to make same-origin API calls
  // that get proxied to Canton, enabling multi-device LAN testing with one port.
  app.use('/v1', (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      const proxyReq = http.request({
        hostname: cantonUrl.hostname,
        port: parseInt(cantonUrl.port || '7575'),
        path: req.originalUrl,
        method: req.method,
        headers: {
          ...req.headers,
          host: cantonUrl.host,
        },
      }, (proxyRes) => {
        res.status(proxyRes.statusCode || 500);
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          if (val && key !== 'transfer-encoding') {
            res.setHeader(key, val as string | string[]);
          }
        }
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('Canton proxy error:', err.message);
        res.status(502).json({ error: 'Canton ledger unavailable' });
      });

      if (body.length > 0) proxyReq.write(body);
      proxyReq.end();
    });
  });

  // Parse JSON bodies for our API routes (after proxy so it doesn't consume proxy bodies)
  app.use(express.json());

  // --- Key Setup Page ---
  app.get('/setup-keys', (req, res) => {
    const { party, uid } = req.query;

    if (!party || !uid || typeof party !== 'string' || typeof uid !== 'string') {
      res.status(400).send(renderErrorPage('Invalid Link', 'Missing party or uid parameter.'));
      return;
    }

    // Validate that this uid+party match a real registration
    const mapping = getPartyBySlackId(uid);
    if (!mapping || mapping.cantonParty !== party) {
      res.status(403).send(renderErrorPage('Invalid Link', 'This setup link is not valid. Please use the link from your registration DM.'));
      return;
    }

    res.send(renderSetupKeysPage(party, uid));
  });

  // --- Public Key API ---
  app.post('/api/keys', (req, res) => {
    const { party, uid, publicKeySpki } = req.body;

    if (!party || !uid || !publicKeySpki) {
      res.status(400).json({ error: 'Missing party, uid, or publicKeySpki' });
      return;
    }

    // Validate uid+party match
    const mapping = getPartyBySlackId(uid);
    if (!mapping || mapping.cantonParty !== party) {
      res.status(403).json({ error: 'Invalid party/uid combination' });
      return;
    }

    // Validate SPKI format
    try {
      const derBuffer = Buffer.from(publicKeySpki, 'base64');
      crypto.createPublicKey({ key: derBuffer, format: 'der', type: 'spki' });
    } catch {
      res.status(400).json({ error: 'Invalid SPKI public key format' });
      return;
    }

    savePublicKey({
      cantonParty: party,
      slackUserId: uid,
      publicKeySpki,
      createdAt: new Date().toISOString(),
    });

    res.json({ ok: true });
  });

  app.get('/api/keys/:party', (req, res) => {
    const record = getPublicKeyByParty(req.params.party);
    if (!record) {
      res.status(404).json({ error: 'No public key found for this party' });
      return;
    }
    res.json({ publicKeySpki: record.publicKeySpki });
  });

  // --- Compose Page ---
  app.get('/compose/:token', (req, res) => {
    const { token } = req.params;

    if (!TOKEN_REGEX.test(token)) {
      res.status(400).send(renderErrorPage('Invalid Link', 'This link is malformed.'));
      return;
    }

    // Peek at the token (don't consume — that happens on POST)
    const tokenInfo = getSendTokenInfo(token);
    if (!tokenInfo) {
      res.status(410).send(renderErrorPage(
        'Link Expired or Invalid',
        'This compose link has expired, been used, or is invalid. Run /cloak-send again to get a new link.'
      ));
      return;
    }

    res.send(renderComposePage(
      token,
      tokenInfo.label,
      tokenInfo.recipientParty,
      tokenInfo.recipientSlackId
    ));
  });

  // --- Send API (consumes send token, creates Canton contract with ciphertext) ---
  app.post('/api/send/:token', async (req, res) => {
    const { token } = req.params;

    if (!TOKEN_REGEX.test(token)) {
      res.status(400).json({ error: 'Invalid token format' });
      return;
    }

    // Atomically consume the send token
    const tokenRecord = consumeSendToken(token);
    if (!tokenRecord) {
      res.status(410).json({ error: 'Token expired, already used, or invalid' });
      return;
    }

    const { ciphertext, description, ttl } = req.body;
    if (!ciphertext) {
      res.status(400).json({ error: 'Missing ciphertext' });
      return;
    }

    try {
      const sentAt = new Date();
      const expiresAt =
        ttl && ttl !== 'none'
          ? new Date(sentAt.getTime() + Number(ttl) * 1000).toISOString()
          : null;

      // Create Canton contract with ciphertext (server never sees plaintext)
      const contractResult = await createContract(tokenRecord.senderParty, 'SecretTransfer', {
        sender: tokenRecord.senderParty,
        recipient: tokenRecord.recipientParty,
        operator: getOperatorParty(),
        label: tokenRecord.label,
        encryptedSecret: ciphertext,
        description: description || 'No description',
        sentAt: sentAt.toISOString(),
        expiresAt,
      });

      const contractId = contractResult.contractId;
      const senderDisplay = `<@${tokenRecord.senderSlackId}>`;

      // Generate a one-time view token and build the web URL
      const webBaseUrl = process.env.WEB_BASE_URL || `http://localhost:${port}`;
      const viewToken = createViewToken(contractId, tokenRecord.recipientParty, tokenRecord.recipientSlackId, expiresAt);
      const viewUrl = `${webBaseUrl}/secret/${viewToken}`;

      // DM the recipient via Slack
      try {
        const dmBlocks = [
          header('Secret Received'),
          divider(),
          ...inboxItemWithLink(senderDisplay, tokenRecord.label, description || 'No description', sentAt.toISOString(), contractId, viewUrl, expiresAt),
          context(
            'This secret is *end-to-end encrypted* — only your browser can decrypt it.',
            'Click the link above to view the secret (one-time use).'
          ),
        ];

        const result = await slackApp.client.chat.postMessage({
          channel: tokenRecord.recipientSlackId,
          blocks: dmBlocks,
          text: `${senderDisplay} sent you an encrypted secret labeled '${tokenRecord.label}'`,
        });

        if (result.ts && result.channel) {
          trackSecret(
            contractId,
            result.ts,
            result.channel,
            tokenRecord.label,
            senderDisplay,
            expiresAt,
            description || 'No description',
            sentAt.toISOString(),
            viewUrl
          );
        }
      } catch {
        console.warn(`Could not DM ${tokenRecord.recipientSlackId}`);
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('Send API error:', err);
      res.status(500).json({ error: 'Failed to create secret contract' });
    }
  });

  // --- Existing: One-time view token → viewer redirect ---
  // Redirects to /viewer/index.html on THIS server (proxied to Canton for API calls).
  // This means only port 3100 needs to be accessible from other devices.
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

    // Build redirect URL — use THIS server's /viewer/ path (not Canton directly).
    // The viewer's /v1/query calls will be proxied to Canton by the reverse proxy above.
    const fragment = [
      'jwt=' + encodeURIComponent(viewerJwt),
      'cid=' + encodeURIComponent(record.contract_id),
      'tid=' + encodeURIComponent(templateId),
      'party=' + encodeURIComponent(record.canton_party),
    ].join('&');

    res.redirect(302, `/viewer/index.html#${fragment}`);
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`  Web viewer:  http://localhost:${port}`);
  });
}
