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

    @keyframes hexDrift1 {
      0% { transform: translate(0, 0) rotate(0deg); opacity: 0.05; }
      50% { transform: translate(-30px, -40px) rotate(180deg); opacity: 0.08; }
      100% { transform: translate(0, 0) rotate(360deg); opacity: 0.05; }
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
      max-width: 480px;
      text-align: center;
      position: relative;
      z-index: 10;
      padding: 3rem 2rem;
      background: rgba(15, 15, 20, 0.7);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(248, 81, 73, 0.4);
      border-radius: 16px;
      box-shadow:
        0 8px 32px 0 rgba(0, 0, 0, 0.6),
        inset 0 1px 0 0 rgba(248, 81, 73, 0.1);
    }

    h1 {
      color: #ff6b6b;
      font-size: 1.8rem;
      margin-bottom: 1.5rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      text-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
    }

    h1::before {
      content: '⚠️';
      display: block;
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    p {
      color: #e0e6ed;
      font-size: 1rem;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="gradient-orb gradient-orb-1"></div>
  <div class="hex">⬡</div>

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
