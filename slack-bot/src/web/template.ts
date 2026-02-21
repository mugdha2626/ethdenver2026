/**
 * HTML templates for pre-redirect error pages and unfurl responses.
 * The secret viewing UI is now a static page served by Canton (daml/viewer/index.html).
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

export function renderErrorPage(title: string, message: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloak</title>
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
  <title>Cloak</title>
  <meta name="robots" content="noindex, nofollow">
</head>
<body>
  <p>Open this link in your browser to view the secret.</p>
</body>
</html>`;
}
