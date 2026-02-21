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

    @keyframes hexDrift1 {
      0% { transform: translate(0, 0) rotate(0deg); opacity: 0.05; }
      50% { transform: translate(-30px, -40px) rotate(180deg); opacity: 0.08; }
      100% { transform: translate(0, 0) rotate(360deg); opacity: 0.05; }
    }

    @keyframes shimmer {
      0% { transform: translateX(-150%); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: translateX(150%); opacity: 0; }
    }

    @keyframes gradientShift {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
      33% { transform: translate(30px, -40px) scale(1.1); opacity: 0.8; }
      66% { transform: translate(-40px, 30px) scale(0.95); opacity: 0.7; }
    }

    @keyframes meshMove {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    body {
      background:
        radial-gradient(ellipse 800px 600px at 10% 20%, rgba(88, 28, 135, 0.35) 0%, transparent 50%),
        radial-gradient(ellipse 600px 800px at 90% 80%, rgba(139, 92, 246, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse 700px 500px at 50% 50%, rgba(59, 130, 246, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse 900px 700px at 30% 70%, rgba(168, 85, 247, 0.25) 0%, transparent 60%),
        linear-gradient(135deg, #0a0015 0%, #050510 25%, #000000 50%, #0a0520 75%, #050515 100%);
      background-size: 400% 400%;
      animation: meshMove 20s ease infinite;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
      font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace;
      position: relative;
      overflow-x: hidden;
    }

    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image:
        linear-gradient(rgba(139, 92, 246, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(139, 92, 246, 0.05) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 1;
      opacity: 0.4;
    }

    .gradient-orb {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
      filter: blur(80px);
      mix-blend-mode: screen;
    }

    .gradient-orb-1 {
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.5) 0%, rgba(139, 92, 246, 0) 70%);
      top: -200px;
      right: -200px;
      animation: gradientShift 15s ease-in-out infinite;
    }

    .gradient-orb-2 {
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(59, 130, 246, 0) 70%);
      bottom: -150px;
      left: -150px;
      animation: gradientShift 18s ease-in-out infinite;
      animation-delay: -6s;
    }

    .hex {
      position: fixed;
      color: rgba(139, 92, 246, 0.15);
      pointer-events: none;
      z-index: 1;
      font-size: 100px;
      line-height: 1;
      top: 20%;
      right: 10%;
      animation: hexDrift1 22s ease-in-out infinite;
    }

    .container {
      max-width: 700px;
      width: 100%;
      position: relative;
      z-index: 10;
    }

    h1 {
      color: #ffffff;
      font-size: 2.5rem;
      margin-bottom: 2.5rem;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 3px;
      font-weight: 700;
      text-shadow: 0 0 40px rgba(139, 92, 246, 0.6);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
    }

    h1::before,
    h1::after {
      content: '⬢';
      font-size: 1rem;
      color: rgba(139, 92, 246, 0.7);
    }

    .subtitle {
      color: #b8c5d6;
      font-size: 0.9rem;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .glass-card {
      background: rgba(15, 15, 20, 0.7);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(139, 92, 246, 0.2);
      border-radius: 16px;
      box-shadow:
        0 8px 32px 0 rgba(0, 0, 0, 0.6),
        inset 0 1px 0 0 rgba(139, 92, 246, 0.1);
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
      margin-bottom: 2rem;
    }

    .glass-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -150%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.1), transparent);
      animation: shimmer 4s ease-in-out infinite;
    }

    .meta {
      padding: 1.5rem 0;
    }

    .meta-row {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 1.5rem;
      padding: 1.1rem 1.8rem;
      border-bottom: 1px solid rgba(139, 92, 246, 0.1);
      transition: all 0.3s ease;
      position: relative;
    }

    .meta-row:last-child {
      border-bottom: none;
    }

    .meta-label {
      color: rgba(50, 100, 200, 1);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .meta-label::before {
      content: '>';
      font-size: 0.7rem;
      opacity: 0.7;
    }

    .meta-value {
      color: rgba(255, 255, 255, 0.95);
      font-size: 0.85rem;
      font-weight: 400;
    }

    label {
      display: block;
      color: rgba(50, 100, 200, 1);
      font-size: 0.75rem;
      margin-bottom: 0.5rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }

    textarea, input[type="text"], select {
      width: 100%;
      background: rgba(10, 14, 26, 0.8);
      color: #e0e6ed;
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 8px;
      padding: 0.8rem;
      font-size: 0.9rem;
      margin-bottom: 1rem;
      font-family: inherit;
      transition: all 0.3s ease;
    }

    textarea {
      min-height: 120px;
      resize: vertical;
      font-family: 'Courier New', 'Courier', monospace;
      font-weight: 600;
      letter-spacing: 0.3px;
    }

    textarea:focus, input:focus, select:focus {
      outline: none;
      border-color: rgba(139, 92, 246, 0.6);
      box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
    }

    select { cursor: pointer; }

    .btn-send {
      background: rgba(139, 92, 246, 0.25);
      backdrop-filter: blur(10px);
      color: rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(139, 92, 246, 0.6);
      border-radius: 10px;
      padding: 0.95rem 1.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.5);
      position: relative;
      overflow: hidden;
      font-family: inherit;
    }

    .btn-send::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(139, 92, 246, 0.4);
      transform: translate(-50%, -50%);
      transition: width 0.6s ease, height 0.6s ease;
    }

    .btn-send:hover::before {
      width: 300px;
      height: 300px;
    }

    .btn-send:hover {
      background: rgba(139, 92, 246, 0.35);
      border-color: rgba(139, 92, 246, 0.8);
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.6);
    }

    .btn-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .status {
      text-align: center;
      margin-top: 1rem;
      font-size: 0.9rem;
      min-height: 1.5rem;
    }

    .success {
      color: #4ade80;
      text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
    }

    .error {
      color: #ff6b6b;
      text-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
    }

    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid rgba(139, 92, 246, 0.2);
      border-top-color: rgba(139, 92, 246, 1);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 0.5rem;
      box-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
    }

    .privacy-note {
      color: #b8c5d6;
      font-size: 0.8rem;
      text-align: center;
      margin-top: 1.5rem;
      line-height: 1.5;
      padding: 1rem;
      background: rgba(15, 15, 20, 0.6);
      backdrop-filter: blur(10px);
      border-radius: 8px;
      border: 1px solid rgba(139, 92, 246, 0.2);
    }

    @media (max-width: 768px) {
      h1 { font-size: 2rem; letter-spacing: 6px; }
      .hex { display: none; }
    }
  </style>
</head>
<body>
  <div class="gradient-orb gradient-orb-1"></div>
  <div class="gradient-orb gradient-orb-2"></div>
  <div class="hex">⬡</div>

  <div class="container">
    <h1>CLOAK</h1>
    <p class="subtitle">Compose and encrypt your secret. It never leaves this browser unencrypted.</p>

    <div class="glass-card meta">
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
