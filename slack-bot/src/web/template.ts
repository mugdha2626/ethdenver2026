/**
 * Self-contained HTML templates for the secret viewing web UI.
 * All CSS/JS is inlined — zero external resources.
 */

/** HTML-escape user content to prevent XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface SecretPageData {
  label: string;
  description: string;
  secret: string;
  senderParty: string;
  sentAt: string;
  expiresAt: string | null;
}

export function renderSecretPage(data: SecretPageData): string {
  const label = escapeHtml(data.label);
  const description = escapeHtml(data.description);
  const secret = escapeHtml(data.secret);
  const sender = escapeHtml(data.senderParty);
  const sentAt = escapeHtml(data.sentAt);
  const expiresAt = data.expiresAt ? escapeHtml(data.expiresAt) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ConfidentialConnect — Secret</title>
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
    .container {
      max-width: 640px;
      width: 100%;
    }
    h1 {
      color: #58a6ff;
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .meta {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    .meta-row {
      display: flex;
      margin-bottom: 0.5rem;
    }
    .meta-row:last-child { margin-bottom: 0; }
    .meta-label {
      color: #8b949e;
      width: 100px;
      flex-shrink: 0;
      font-size: 0.85rem;
    }
    .meta-value {
      color: #c9d1d9;
      font-size: 0.85rem;
      word-break: break-all;
    }
    .secret-box {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .secret-label {
      color: #8b949e;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .secret-content {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.9rem;
      color: #f0f6fc;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    button {
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #30363d; }
    .btn-copy { background: #238636; border-color: #2ea043; color: #fff; }
    .btn-copy:hover { background: #2ea043; }
    .timer {
      color: #8b949e;
      font-size: 0.8rem;
      text-align: center;
    }
    .cleared {
      text-align: center;
      padding: 3rem 1rem;
    }
    .cleared h2 {
      color: #8b949e;
      font-size: 1.2rem;
      margin-bottom: 0.5rem;
    }
    .cleared p {
      color: #484f58;
      font-size: 0.85rem;
    }
    @media print {
      .secret-content { color: transparent !important; }
      .secret-content::after { content: '[REDACTED]'; color: #8b949e; }
    }
  </style>
</head>
<body>
  <div class="container" id="secret-view">
    <h1>ConfidentialConnect</h1>
    <div class="meta">
      <div class="meta-row">
        <span class="meta-label">Label</span>
        <span class="meta-value">${label}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Description</span>
        <span class="meta-value">${description}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">From</span>
        <span class="meta-value">${sender}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Sent</span>
        <span class="meta-value">${sentAt}</span>
      </div>
      ${expiresAt ? `<div class="meta-row">
        <span class="meta-label">Expires</span>
        <span class="meta-value">${expiresAt}</span>
      </div>` : ''}
    </div>
    <div class="secret-box">
      <div class="secret-label">Secret</div>
      <div class="secret-content" id="secret-text">${secret}</div>
    </div>
    <div class="actions">
      <button class="btn-copy" id="copy-btn" onclick="copySecret()">Copy to Clipboard</button>
      <button onclick="clearNow()">Clear Now</button>
    </div>
    <div class="timer" id="timer">This page will auto-clear in 5 minutes.</div>
  </div>

  <div class="container cleared" id="cleared-view" style="display:none;">
    <h2>Secret Cleared</h2>
    <p>The secret has been removed from this page for your security.</p>
    <p>You can close this tab.</p>
  </div>

  <script>
    (function() {
      var AUTO_CLEAR_MS = 5 * 60 * 1000;
      var startTime = Date.now();
      var cleared = false;

      function clearPage() {
        if (cleared) return;
        cleared = true;
        document.getElementById('secret-view').style.display = 'none';
        document.getElementById('cleared-view').style.display = 'block';
        try { history.replaceState(null, '', '/secret/cleared'); } catch(e) {}
      }

      // Auto-clear after 5 minutes
      var autoTimer = setTimeout(clearPage, AUTO_CLEAR_MS);

      // Update countdown
      setInterval(function() {
        if (cleared) return;
        var remaining = AUTO_CLEAR_MS - (Date.now() - startTime);
        if (remaining <= 0) return;
        var mins = Math.floor(remaining / 60000);
        var secs = Math.floor((remaining % 60000) / 1000);
        document.getElementById('timer').textContent =
          'This page will auto-clear in ' + mins + 'm ' + secs + 's.';
      }, 1000);

      // Clear on tab switch
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) clearPage();
      });

      // Redact on print
      window.addEventListener('beforeprint', function() {
        var el = document.getElementById('secret-text');
        if (el) el.textContent = '[REDACTED]';
      });

      // Expose copy and clear functions
      window.copySecret = function() {
        if (cleared) return;
        var text = document.getElementById('secret-text').textContent;
        navigator.clipboard.writeText(text).then(function() {
          var btn = document.getElementById('copy-btn');
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy to Clipboard'; }, 2000);
        });
      };

      window.clearNow = function() {
        clearTimeout(autoTimer);
        clearPage();
      };
    })();
  </script>
</body>
</html>`;
}

export function renderErrorPage(title: string, message: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ConfidentialConnect</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 480px;
      text-align: center;
    }
    h1 {
      color: #f85149;
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    p {
      color: #8b949e;
      font-size: 0.95rem;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </div>
</body>
</html>`;
}

/** Generic page returned to Slack's unfurl bot — no secret consumed */
export function renderUnfurlPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ConfidentialConnect</title>
  <meta name="robots" content="noindex, nofollow">
</head>
<body>
  <p>Open this link in your browser to view the secret.</p>
</body>
</html>`;
}
