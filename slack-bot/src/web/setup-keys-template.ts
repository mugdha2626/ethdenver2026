/**
 * HTML template for browser-side RSA-OAEP key generation.
 * Generates a 2048-bit keypair, stores private key in IndexedDB,
 * and POSTs the public key (SPKI) to the Express server.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSetupKeysPage(party: string, uid: string): string {
  const safeParty = escapeHtml(party);
  const safeUid = escapeHtml(uid);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>ConfidentialConnect — Set Up Encryption</title>
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
    .container { max-width: 520px; width: 100%; }
    h1 { color: #58a6ff; font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #8b949e; font-size: 0.9rem; margin-bottom: 2rem; line-height: 1.5; }
    .status-box {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1.5rem;
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .status-box p { margin-bottom: 0.75rem; font-size: 0.95rem; line-height: 1.5; }
    .spinner {
      display: inline-block;
      width: 24px; height: 24px;
      border: 3px solid #30363d;
      border-top-color: #58a6ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 0.75rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    button {
      background: #238636; color: #fff;
      border: 1px solid #2ea043; border-radius: 6px;
      padding: 0.6rem 1.5rem; font-size: 0.95rem;
      cursor: pointer; transition: background 0.15s;
    }
    button:hover { background: #2ea043; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .success { color: #3fb950; }
    .error { color: #f85149; }
    .info { color: #8b949e; font-size: 0.8rem; margin-top: 1rem; line-height: 1.4; }
    .existing { color: #d29922; }
  </style>
</head>
<body>
  <div class="container">
    <h1>ConfidentialConnect</h1>
    <p class="subtitle">Set up end-to-end encryption for your secrets. Your private key never leaves this browser.</p>

    <div class="status-box" id="status-box">
      <p id="status-text">Ready to generate your encryption keys.</p>
      <button id="generate-btn" onclick="generateKeys()">Generate Encryption Keys</button>
      <p class="info">Your private key will be stored securely in this browser's IndexedDB.<br>It never leaves your device.</p>
    </div>
  </div>

  <script>
    (function() {
      'use strict';

      var PARTY = ${JSON.stringify(safeParty)};
      var UID = ${JSON.stringify(safeUid)};
      var DB_NAME = 'cc-encryption-keys';
      var STORE_NAME = 'private-keys';

      function setStatus(html, showSpinner) {
        document.getElementById('status-text').innerHTML = html;
        var btn = document.getElementById('generate-btn');
        if (showSpinner) {
          btn.style.display = 'none';
        }
      }

      function openIDB() {
        return new Promise(function(resolve, reject) {
          var req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = function() {
            req.result.createObjectStore(STORE_NAME, { keyPath: 'party' });
          };
          req.onsuccess = function() { resolve(req.result); };
          req.onerror = function() { reject(req.error); };
        });
      }

      function getExistingKey(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readonly');
          var store = tx.objectStore(STORE_NAME);
          var req = store.get(PARTY);
          req.onsuccess = function() { resolve(req.result || null); };
          req.onerror = function() { reject(req.error); };
        });
      }

      function storePrivateKey(db, privateKey) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          store.put({ party: PARTY, key: privateKey, createdAt: new Date().toISOString() });
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { reject(tx.error); };
        });
      }

      window.generateKeys = async function() {
        var btn = document.getElementById('generate-btn');
        btn.disabled = true;

        try {
          setStatus('<div class="spinner"></div><br>Opening key storage...', false);

          var db = await openIDB();

          // Check for existing key
          var existing = await getExistingKey(db);
          if (existing) {
            setStatus('<span class="existing">Keys already exist for this identity.</span><br><br>If you want to regenerate, clear your browser data for this site first.', true);
            return;
          }

          setStatus('<div class="spinner"></div><br>Generating RSA-OAEP 2048-bit keypair...', true);

          // Generate RSA-OAEP 2048 keypair
          var keyPair = await crypto.subtle.generateKey(
            { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
            false, // non-extractable private key
            ['encrypt', 'decrypt']
          );

          setStatus('<div class="spinner"></div><br>Exporting public key...', true);

          // Export public key as SPKI
          var spkiBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
          var spkiBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(spkiBuffer)));

          setStatus('<div class="spinner"></div><br>Saving private key to browser...', true);

          // Store private key in IndexedDB (non-extractable CryptoKey object)
          await storePrivateKey(db, keyPair.privateKey);

          setStatus('<div class="spinner"></div><br>Uploading public key to server...', true);

          // POST public key to Express
          var response = await fetch('/api/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ party: PARTY, uid: UID, publicKeySpki: spkiBase64 })
          });

          if (!response.ok) {
            var errData = await response.json().catch(function() { return {}; });
            throw new Error(errData.error || 'Server returned ' + response.status);
          }

          setStatus('<span class="success">Encryption keys set up successfully!</span><br><br>You can now receive end-to-end encrypted secrets.<br>You can close this tab.', true);

        } catch (err) {
          setStatus('<span class="error">Error: ' + (err.message || 'Unknown error') + '</span><br><br>Please try again.', false);
          btn.disabled = false;
          btn.style.display = '';
        }
      };
    })();
  </script>
</body>
</html>`;
}
