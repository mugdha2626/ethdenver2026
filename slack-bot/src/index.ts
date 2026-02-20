/**
 * ConfidentialConnect - Slack Bot Entry Point
 * A privacy black box powered by Canton + Slack
 */

import 'dotenv/config';
import { App, LogLevel } from '@slack/bolt';
import { registerCommand } from './commands/register';
import { commitCommand } from './commands/commit';
import { verifyCommand } from './commands/verify';
import { proveCommand } from './commands/prove';
import { sendCommand } from './commands/send';
import { inboxCommand } from './commands/inbox';
import { auditCommand } from './commands/audit';
import { statusCommand } from './commands/status';
import { closeDb } from './stores/db';

// Load verifiers (side-effect: registers them)
import './services/verifiers/aws';
import './services/verifiers/stripe';
import './services/verifiers/github';

// Validate required environment variables
const requiredEnvVars = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize Slack app with Socket Mode (no public URL needed)
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
});

// Register all commands
registerCommand(app);   // /cc-register
commitCommand(app);     // /cc-commit
verifyCommand(app);     // /cc-verify
proveCommand(app);      // /cc-prove
sendCommand(app);       // /cc-send
inboxCommand(app);      // /cc-inbox
auditCommand(app);      // /cc-audit
statusCommand(app);     // /cc-status

// Health check / startup
async function start(): Promise<void> {
  await app.start();
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║        ConfidentialConnect is running!           ║');
  console.log('  ║                                                  ║');
  console.log('  ║  Slack Bot:  Connected (Socket Mode)             ║');
  console.log(`  ║  Canton API: ${process.env.CANTON_JSON_API_URL || 'http://localhost:7575'}        ║`);
  console.log('  ║                                                  ║');
  console.log('  ║  Commands:                                       ║');
  console.log('  ║    /cc-register  - Register Canton identity      ║');
  console.log('  ║    /cc-commit    - Commit secret hash            ║');
  console.log('  ║    /cc-verify    - Live-verify via API           ║');
  console.log('  ║    /cc-prove     - Share proof with auditor      ║');
  console.log('  ║    /cc-send      - Send secret to someone        ║');
  console.log('  ║    /cc-inbox     - View received secrets         ║');
  console.log('  ║    /cc-audit     - Auditor dashboard             ║');
  console.log('  ║    /cc-status    - Your overview                 ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});

start().catch((err) => {
  console.error('Failed to start:', err);
  closeDb();
  process.exit(1);
});
