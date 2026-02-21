/**
 * HTML template for browser-side secret composition and encryption.
 * Fetches recipient's public key, performs hybrid encryption (AES-256-GCM + RSA-OAEP),
 * and POSTs only ciphertext to the server. The plaintext secret never leaves the browser.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderComposePage(
  token: string,
  label: string,
  recipientParty: string,
  recipientSlackId: string
): string {
  const safeLabel = escapeHtml(label);
  const safeRecipientParty = escapeHtml(recipientParty);
  const safeRecipientSlackId = escapeHtml(recipientSlackId);
  const safeToken = escapeHtml(token);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Cloak — Compose Secret</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      padding: 2rem 1rem;
    }
    .container { max-width: 580px; width: 100%; }
    h1 { color: #58a6ff; font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #8b949e; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .meta {
      background: #161b22; border: 1px solid #30363d; border-radius: 6px;
      padding: 1rem; margin-bottom: 1.5rem;
    }
    .meta-row { display: flex; margin-bottom: 0.4rem; }
    .meta-row:last-child { margin-bottom: 0; }
    .meta-label { color: #8b949e; width: 90px; flex-shrink: 0; font-size: 0.85rem; }
    .meta-value { color: #c9d1d9; font-size: 0.85rem; }
    label { display: block; color: #c9d1d9; font-size: 0.85rem; margin-bottom: 0.3rem; font-weight: 600; }
    textarea, input[type="text"], select {
      width: 100%; background: #161b22; color: #c9d1d9;
      border: 1px solid #30363d; border-radius: 6px;
      padding: 0.6rem; font-size: 0.9rem; margin-bottom: 1rem;
      font-family: inherit;
    }
    textarea { min-height: 120px; resize: vertical; font-family: 'SFMono-Regular', Consolas, monospace; }
    textarea:focus, input:focus, select:focus { outline: none; border-color: #58a6ff; }
    select { cursor: pointer; }
    .btn-send {
      background: #238636; color: #fff; border: 1px solid #2ea043; border-radius: 6px;
      padding: 0.7rem 2rem; font-size: 0.95rem; cursor: pointer; transition: background 0.15s;
      width: 100%;
    }
    .btn-send:hover { background: #2ea043; }
    .btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { text-align: center; margin-top: 1rem; font-size: 0.9rem; min-height: 1.5rem; }
    .success { color: #3fb950; }
    .error { color: #f85149; }
    .spinner {
      display: inline-block; width: 18px; height: 18px;
      border: 2px solid #30363d; border-top-color: #58a6ff;
      border-radius: 50%; animation: spin 0.8s linear infinite;
      vertical-align: middle; margin-right: 0.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .privacy-note {
      color: #8b949e; font-size: 0.75rem; text-align: center;
      margin-top: 1rem; line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Cloak</h1>
    <p class="subtitle">Compose and encrypt your secret. It never leaves this browser unencrypted.</p>

    <div class="meta">
      <div class="meta-row">
        <span class="meta-label">Label</span>
        <span class="meta-value" id="meta-label">${safeLabel}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Recipient</span>
        <span class="meta-value" id="meta-recipient"><@${safeRecipientSlackId}></span>
      </div>
    </div>

    <label for="secret-input">Secret</label>
    <textarea id="secret-input" placeholder="Paste your secret here..."></textarea>

    <label for="description-input">Description (optional)</label>
    <input type="text" id="description-input" placeholder="e.g., Production AWS key for deployment">

    <label for="ttl-input">Expiration</label>
    <select id="ttl-input">
      <option value="none">No expiration</option>
      <option value="30">30 seconds</option>
      <option value="300">5 minutes</option>
      <option value="3600">1 hour</option>
      <option value="86400">24 hours</option>
      <option value="604800">7 days</option>
    </select>

    <button class="btn-send" id="send-btn" onclick="encryptAndSend()">Encrypt &amp; Send</button>
    <div class="status" id="status"></div>
    <p class="privacy-note">Your secret is encrypted in your browser using the recipient's public key.<br>Neither Slack, our servers, nor Canton ever see the plaintext.</p>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js"></script>
  <script>
    (function() {
      'use strict';

      var TOKEN = ${JSON.stringify(safeToken)};
      var RECIPIENT_PARTY = ${JSON.stringify(safeRecipientParty)};
      var useWebCrypto = !!(crypto && crypto.subtle);

      function setStatus(html) {
        document.getElementById('status').innerHTML = html;
      }

      // --- Forge-based encryption helpers for non-secure contexts ---

      function forgeImportSpki(spkiBase64) {
        var der = forge.util.decode64(spkiBase64);
        var asn1 = forge.asn1.fromDer(der);
        return forge.pki.publicKeyFromAsn1(asn1);
      }

      function forgeEncrypt(secret, recipientPubKey) {
        // Generate random AES-256 key and IV
        var rawAesKey = forge.random.getBytesSync(32);
        var iv = forge.random.getBytesSync(12);

        // AES-GCM encrypt the secret
        var cipher = forge.cipher.createCipher('AES-GCM', rawAesKey);
        cipher.start({ iv: iv, tagLength: 128 });
        cipher.update(forge.util.createBuffer(secret, 'utf8'));
        cipher.finish();
        var c = cipher.output.getBytes();
        var t = cipher.mode.tag.getBytes();

        // RSA-OAEP encrypt the AES key
        var encryptedAesKey = recipientPubKey.encrypt(rawAesKey, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() }
        });

        return {
          v: 1,
          k: forge.util.encode64(encryptedAesKey),
          iv: forge.util.encode64(iv),
          t: forge.util.encode64(t),
          c: forge.util.encode64(c)
        };
      }

      // -----------------------------------------------------------------

      window.encryptAndSend = async function() {
        var btn = document.getElementById('send-btn');
        var secretEl = document.getElementById('secret-input');
        var descEl = document.getElementById('description-input');
        var ttlEl = document.getElementById('ttl-input');

        var secret = secretEl.value.trim();
        if (!secret) {
          setStatus('<span class="error">Please enter a secret.</span>');
          return;
        }

        btn.disabled = true;
        setStatus('<span class="spinner"></span> Fetching recipient\\'s public key...');

        try {
          // 1. Fetch recipient's public key
          var keyRes = await fetch('/api/keys/' + encodeURIComponent(RECIPIENT_PARTY));
          if (!keyRes.ok) {
            var keyErr = await keyRes.json().catch(function() { return {}; });
            throw new Error(keyErr.error || 'Could not fetch recipient public key');
          }
          var keyData = await keyRes.json();
          var spkiBase64 = keyData.publicKeySpki;

          setStatus('<span class="spinner"></span> Encrypting secret...');

          var envelope;

          if (useWebCrypto) {
            // --- Native Web Crypto path ---
            var spkiBytes = Uint8Array.from(atob(spkiBase64), function(c) { return c.charCodeAt(0); });
            var recipientPubKey = await crypto.subtle.importKey(
              'spki', spkiBytes.buffer,
              { name: 'RSA-OAEP', hash: 'SHA-256' },
              false, ['encrypt']
            );

            var rawAesKey = crypto.getRandomValues(new Uint8Array(32));
            var iv = crypto.getRandomValues(new Uint8Array(12));

            var aesKey = await crypto.subtle.importKey(
              'raw', rawAesKey, { name: 'AES-GCM' }, false, ['encrypt']
            );

            var plainBytes = new TextEncoder().encode(secret);
            var aesCiphertext = await crypto.subtle.encrypt(
              { name: 'AES-GCM', iv: iv, tagLength: 128 },
              aesKey, plainBytes
            );

            var fullCipher = new Uint8Array(aesCiphertext);
            var c = fullCipher.slice(0, fullCipher.length - 16);
            var t = fullCipher.slice(fullCipher.length - 16);

            var encryptedAesKey = await crypto.subtle.encrypt(
              { name: 'RSA-OAEP' }, recipientPubKey, rawAesKey
            );

            envelope = {
              v: 1,
              k: btoa(String.fromCharCode.apply(null, new Uint8Array(encryptedAesKey))),
              iv: btoa(String.fromCharCode.apply(null, iv)),
              t: btoa(String.fromCharCode.apply(null, t)),
              c: btoa(String.fromCharCode.apply(null, c))
            };
          } else {
            // --- Forge fallback path (HTTP over LAN) ---
            var forgePubKey = forgeImportSpki(spkiBase64);
            envelope = forgeEncrypt(secret, forgePubKey);
          }

          var ciphertextB64 = btoa(JSON.stringify(envelope));

          setStatus('<span class="spinner"></span> Sending encrypted secret...');

          // POST ciphertext to server
          var sendRes = await fetch('/api/send/' + encodeURIComponent(TOKEN), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ciphertext: ciphertextB64,
              description: descEl.value.trim() || 'No description',
              ttl: ttlEl.value
            })
          });

          if (!sendRes.ok) {
            var sendErr = await sendRes.json().catch(function() { return {}; });
            throw new Error(sendErr.error || 'Failed to send secret');
          }

          // Success
          secretEl.value = '';
          btn.style.display = 'none';
          setStatus('<span class="success">Secret encrypted and sent!</span><br><br>The recipient will get a DM with a one-time viewing link.<br>You can close this tab.');

        } catch (err) {
          setStatus('<span class="error">Error: ' + (err.message || 'Unknown error') + '</span>');
          btn.disabled = false;
        }
      };
    })();
  </script>
</body>
</html>`;
}
