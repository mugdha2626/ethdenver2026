/**
 * /cloak-register - Register a Slack user as a Canton party
 */

import type { App } from '@slack/bolt';
import { allocateParty, createContract, getOperatorParty, listParties } from '../services/canton';
import { savePartyMapping, getPartyBySlackId } from '../stores/party-mapping';
import { successMessage, errorMessage } from '../utils/slack-blocks';

export function registerCommand(app: App): void {
  app.command('/cloak-register', async ({ command, ack, respond, client }) => {
    await ack();
    const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3100';

    const slackUserId = command.user_id;
    const slackUsername = command.user_name;

    try {
      // Check if already registered
      const existing = getPartyBySlackId(slackUserId);
      if (existing) {
        // Validate the party still exists on Canton (sandbox may have been restarted)
        const parties = await listParties();
        if (parties.includes(existing.cantonParty)) {
          await respond({
            response_type: 'ephemeral',
            blocks: successMessage(
              'Already Registered',
              `You're already registered as \`${existing.cantonParty}\`. You're good to go!`
            ),
          });
          return;
        }
        // Party no longer exists on Canton — clear stale mapping and re-register
        console.log(`Stale party for ${slackUserId}, re-registering...`);
      }

      // Allocate a new Canton party (or reuse if already allocated on ledger)
      const partyHint = `user-${slackUserId}`;
      let cantonParty: string;
      try {
        cantonParty = await allocateParty(partyHint, slackUsername);
      } catch (err) {
        // Party already exists on Canton (e.g., from a previous attempt)
        // Extract the party identifier from the error or construct it
        if (err instanceof Error && err.message.includes('already allocated')) {
          // Use the party hint format that Canton would have assigned
          // Query parties list to find the exact identifier
          const parties = await listParties();
          const found = parties.find((p) => p.startsWith(partyHint));
          if (found) {
            cantonParty = found;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      // Create UserIdentity contract on Canton (skip if already exists from a previous registration)
      try {
        await createContract(getOperatorParty(), 'UserIdentity', {
          operator: getOperatorParty(),
          user: cantonParty,
          slackUserId,
          slackUsername,
          registeredAt: new Date().toISOString(),
        });
      } catch (contractErr) {
        if (contractErr instanceof Error && contractErr.message.includes('DUPLICATE_CONTRACT_KEY')) {
          console.log(`UserIdentity contract already exists for ${cantonParty}, reusing.`);
        } else {
          throw contractErr;
        }
      }

      // Save mapping locally
      savePartyMapping({
        slackUserId,
        slackUsername,
        cantonParty,
        registeredAt: new Date().toISOString(),
      });

      // DM the user a link to set up E2E encryption keys
      const setupUrl = `${webBaseUrl}/setup-keys?party=${encodeURIComponent(cantonParty)}&uid=${encodeURIComponent(slackUserId)}`;
      try {
        await client.chat.postMessage({
          channel: slackUserId,
          text: `Set up E2E encryption: ${setupUrl}`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: 'Set Up Encryption Keys', emoji: true },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text:
                  'To enable *end-to-end encrypted* secret sharing, set up your encryption keys.\n\n' +
                  'Your private key stays in your browser — it never leaves your device.\n\n' +
                  `<${setupUrl}|Set Up Encryption Keys>`,
              },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: 'Open this link in the browser you\'ll use to view secrets.' }],
            },
          ],
        });
      } catch {
        console.warn(`Could not DM setup link to ${slackUserId}`);
      }

      await respond({
        response_type: 'ephemeral',
        blocks: successMessage(
          'Welcome to Cloak!',
          `Your private Canton identity is ready: \`${cantonParty}\`\n\n` +
            '*What you can do now:*\n' +
            '> `/cloak-send <label> @user` - Send a secret securely\n' +
            '> `/cloak-inbox` - View secrets shared with you\n\n' +
            '_Check your DMs for a link to set up end-to-end encryption._'
        ),
      });
    } catch (err) {
      console.error('Registration error:', err);
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Registration Failed',
          `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`
        ),
      });
    }
  });
}
