/**
 * ConfidentialConnect - Slack Bot Entry Point
 * A privacy black box powered by Canton + Slack
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { App, LogLevel } from '@slack/bolt';
import { registerCommand } from './commands/register';
import { sendCommand } from './commands/send';
import { inboxCommand } from './commands/inbox';
import { closeDb } from './stores/db';
import { clearAllMappings, getAllMappings } from './stores/party-mapping';
import { discoverPackageId, allocateParty, setOperatorParty, listParties } from './services/canton';

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

// Global error handler
app.error(async (error) => {
  console.error('[APP ERROR]', error);
});

// Register all commands
registerCommand(app);   // /cc-register
sendCommand(app);       // /cc-send
inboxCommand(app);      // /cc-inbox

// Health check / startup
async function start(): Promise<void> {
  // Bootstrap Canton: allocate operator party + discover package ID
  console.log(`  Connecting to Canton (${process.env.CANTON_API_VERSION || 'v1'} API)...`);
  try {
    const operatorId = await allocateParty('operator', 'Operator');
    setOperatorParty(operatorId);
    console.log(`  Operator party: ${operatorId.substring(0, 30)}...`);
  } catch (err) {
    // Already allocated — find it in the party list
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      errMsg.includes('already allocated') ||
      errMsg.includes('ALREADY_EXISTS') ||
      errMsg.includes('already exists')
    ) {
      const parties = await listParties();
      const op = parties.find((p) => p.startsWith('operator'));
      if (op) {
        setOperatorParty(op);
        console.log(`  Operator party (existing): ${op.substring(0, 30)}...`);
      } else {
        throw new Error('Could not find operator party');
      }
    } else {
      throw err;
    }
  }
  await discoverPackageId();

  // Check for stale party mappings (Canton sandbox may have been restarted)
  const existingMappings = getAllMappings();
  if (existingMappings.length > 0) {
    const cantonParties = await listParties();
    const anyValid = existingMappings.some((m) => cantonParties.includes(m.cantonParty));
    if (!anyValid) {
      console.log('  Detected fresh Canton sandbox — clearing stale local data...');
      clearAllMappings();
    }
  }

  await app.start();
  console.log('');
  const apiVer = process.env.CANTON_API_VERSION || 'v1';
  const apiUrl = process.env.CANTON_JSON_API_URL || 'http://localhost:7575';
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║        ConfidentialConnect is running!           ║');
  console.log('  ║                                                  ║');
  console.log('  ║  Slack Bot:  Connected (Socket Mode)             ║');
  console.log(`  ║  Canton API: ${apiUrl} (${apiVer})`.padEnd(55) + '║');
  console.log('  ║                                                  ║');
  console.log('  ║  Commands:                                       ║');
  console.log('  ║    /cc-register  - Register Canton identity      ║');
  console.log('  ║    /cc-send      - Send secret to someone        ║');
  console.log('  ║    /cc-inbox     - View received secrets         ║');
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
