/**
 * Cloak - Slack Bot Entry Point
 * A privacy black box powered by Canton + Slack
 */

import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Auto-detect LAN IP for multi-device testing
function getLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}
// ngrok tunnel listener — kept at module scope for graceful shutdown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ngrokListener: any = null;

async function startNgrokTunnel(port: number): Promise<string | null> {
  if (!process.env.NGROK_AUTHTOKEN) return null;
  try {
    // Dynamic import so the app still works without @ngrok/ngrok installed
    const ngrok = await Function('return import("@ngrok/ngrok")')();
    ngrokListener = await ngrok.forward({ addr: port, authtoken_from_env: true });
    const url: string = ngrokListener.url();
    return url;
  } catch {
    // @ngrok/ngrok not installed or tunnel failed — silently skip
    return null;
  }
}

import { App, LogLevel } from '@slack/bolt';
import { registerCommand } from './commands/register';
import { sendCommand } from './commands/send';
import { inboxCommand } from './commands/inbox';
import { closeDb } from './stores/db';
import { clearAllMappings, getAllMappings } from './stores/party-mapping';
import { clearAllEncryptionKeys } from './stores/encryption-keys';
import { initTimerManager, clearAllTimers } from './stores/secret-timers';
import { discoverPackageId, allocateParty, setOperatorParty, listParties } from './services/canton';
import { startWebServer } from './web/server';
import { purgeExpiredTokens } from './stores/view-tokens';

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

// Initialize timer manager for auto-expiring secret DMs
initTimerManager(app.client);

// Register all commands
registerCommand(app);   // /cloak-register
sendCommand(app);       // /cloak-send
inboxCommand(app);      // /cloak-inbox

// Health check / startup
async function start(): Promise<void> {
  // Bootstrap Canton: allocate operator party + discover package ID
  console.log('  Connecting to Canton...');
  try {
    const operatorId = await allocateParty('operator', 'Operator');
    setOperatorParty(operatorId);
    console.log(`  Operator party: ${operatorId.substring(0, 30)}...`);
  } catch (err) {
    // Already allocated — find it
    if (err instanceof Error && err.message.includes('already allocated')) {
      const { listParties } = await import('./services/canton');
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
      clearAllEncryptionKeys();
    }
  }

  // Start the web viewer for zero-knowledge secret viewing
  const webPort = parseInt(process.env.WEB_PORT || '3100', 10);

  // Auto-detect LAN IP so Slack DM links work from other devices on the same network
  const lanIp = getLanIp();
  if (!process.env.WEB_BASE_URL && lanIp) {
    process.env.WEB_BASE_URL = `http://${lanIp}:${webPort}`;
  }

  startWebServer(webPort, app);

  // Attempt ngrok tunnel for public demo access
  const ngrokUrl = await startNgrokTunnel(webPort);
  if (ngrokUrl) {
    process.env.WEB_BASE_URL = ngrokUrl;
  }

  // Purge expired view tokens periodically
  purgeExpiredTokens();
  setInterval(purgeExpiredTokens, 60 * 60 * 1000);

  await app.start();
  const webBaseUrl = process.env.WEB_BASE_URL || `http://localhost:${webPort}`;
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║               Cloak is running!                      ║');
  console.log('  ║                                                      ║');
  console.log('  ║  Slack Bot:  Connected (Socket Mode)                 ║');
  console.log(`  ║  Canton API: ${(process.env.CANTON_JSON_API_URL || 'http://localhost:7575').padEnd(40)}║`);
  console.log(`  ║  Web Viewer: ${`http://localhost:${webPort}`.padEnd(40)}║`);
  if (lanIp) {
  console.log(`  ║  LAN Access: ${`http://${lanIp}:${webPort}`.padEnd(40)}║`);
  }
  if (ngrokUrl) {
  console.log(`  ║  ngrok:      ${ngrokUrl.padEnd(40)}║`);
  }
  console.log(`  ║  DM Links:   ${webBaseUrl.padEnd(40)}║`);
  console.log('  ║                                                      ║');
  console.log('  ║  Commands:                                           ║');
  console.log('  ║    /cloak-register  - Register Canton identity       ║');
  console.log('  ║    /cloak-send      - Send secret to someone         ║');
  console.log('  ║    /cloak-inbox     - View received secrets          ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (ngrokListener) await ngrokListener.close().catch(() => {});
  clearAllTimers();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (ngrokListener) await ngrokListener.close().catch(() => {});
  clearAllTimers();
  closeDb();
  process.exit(0);
});

start().catch((err) => {
  console.error('Failed to start:', err);
  closeDb();
  process.exit(1);
});
