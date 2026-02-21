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
  <title>Cloak — Set Up Encryption</title>
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
      font-size: 0.95rem;
      margin-bottom: 2rem;
      line-height: 1.6;
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

    .status-box {
      padding: 2rem;
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .status-box p {
      margin-bottom: 1rem;
      font-size: 1rem;
      line-height: 1.6;
      position: relative;
      z-index: 1;
    }

    .spinner {
      display: inline-block;
      width: 32px;
      height: 32px;
      border: 3px solid rgba(139, 92, 246, 0.2);
      border-top-color: rgba(139, 92, 246, 1);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
      box-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
    }

    button {
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
      text-transform: uppercase;
      letter-spacing: 1.5px;
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.5);
      position: relative;
      overflow: hidden;
      z-index: 1;
      font-family: inherit;
    }

    button::before {
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

    button:hover::before {
      width: 300px;
      height: 300px;
    }

    button:hover {
      background: rgba(139, 92, 246, 0.35);
      border-color: rgba(139, 92, 246, 0.8);
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.6);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .success {
      color: #4ade80;
      text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
    }

    .error {
      color: #ff6b6b;
      text-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
    }

    .info {
      color: #b8c5d6;
      font-size: 0.85rem;
      margin-top: 1rem;
      line-height: 1.5;
      padding: 1rem;
      background: rgba(15, 15, 20, 0.6);
      backdrop-filter: blur(10px);
      border-radius: 8px;
      border: 1px solid rgba(139, 92, 246, 0.2);
      position: relative;
      z-index: 1;
    }

    .existing {
      color: rgba(50, 100, 200, 1);
      text-shadow: 0 0 10px rgba(50, 100, 200, 0.5);
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
    <p class="subtitle">Set up end-to-end encryption for your secrets. Your private key never leaves this browser.</p>

    <div class="glass-card status-box" id="status-box">
      <p id="status-text">Ready to generate your encryption keys.</p>
      <button id="generate-btn" onclick="generateKeys()">Generate Encryption Keys</button>
      <p class="info">Your private key will be stored securely in this browser's IndexedDB.<br>It never leaves your device.</p>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js"></script>
  <script>
    (function() {
      'use strict';

      var PARTY = ${JSON.stringify(safeParty)};
      var UID = ${JSON.stringify(safeUid)};
      var DB_NAME = 'cloak-encryption-keys';
      var STORE_NAME = 'private-keys';
      var useWebCrypto = !!(crypto && crypto.subtle);

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

      // --- Forge-based fallback for non-secure contexts (HTTP over LAN) ---

      function forgeGenerateKeyPair() {
        return new Promise(function(resolve, reject) {
          // Use setTimeout to let the UI render the spinner before blocking
          setTimeout(function() {
            try {
              var keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
              resolve(keypair);
            } catch (err) {
              reject(err);
            }
          }, 50);
        });
      }

      function forgePublicKeyToSpkiBase64(publicKey) {
        var asn1 = forge.pki.publicKeyToAsn1(publicKey);
        var der = forge.asn1.toDer(asn1).getBytes();
        return forge.util.encode64(der);
      }

      function forgePrivateKeyToPem(privateKey) {
        return forge.pki.privateKeyToPem(privateKey);
      }

      // -------------------------------------------------------------------

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

          var spkiBase64;
          var privateKeyToStore;

          if (useWebCrypto) {
            // --- Native Web Crypto path (HTTPS / localhost) ---
            setStatus('<div class="spinner"></div><br>Generating RSA-OAEP 2048-bit keypair...', true);

            var keyPair = await crypto.subtle.generateKey(
              { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
              false,
              ['encrypt', 'decrypt']
            );

            setStatus('<div class="spinner"></div><br>Exporting public key...', true);

            var spkiBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
            spkiBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(spkiBuffer)));
            privateKeyToStore = keyPair.privateKey;

          } else {
            // --- Forge fallback path (HTTP over LAN) ---
            setStatus('<div class="spinner"></div><br>Generating RSA 2048-bit keypair (this may take a few seconds)...', true);

            var forgeKeyPair = await forgeGenerateKeyPair();

            setStatus('<div class="spinner"></div><br>Exporting public key...', true);

            spkiBase64 = forgePublicKeyToSpkiBase64(forgeKeyPair.publicKey);
            // Store private key as PEM string (forge keys aren't CryptoKey objects)
            privateKeyToStore = forgePrivateKeyToPem(forgeKeyPair.privateKey);
          }

          setStatus('<div class="spinner"></div><br>Saving private key to browser...', true);

          await storePrivateKey(db, privateKeyToStore);

          setStatus('<div class="spinner"></div><br>Uploading public key to server...', true);

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
