/**
 * /cc-register - Register a Slack user as a Canton party
 */

import type { App } from '@slack/bolt';
import { allocateParty, createContract, getOperatorParty, listParties } from '../services/canton';
import { savePartyMapping, getPartyBySlackId } from '../stores/party-mapping';
import { successMessage, errorMessage } from '../utils/slack-blocks';

export function registerCommand(app: App): void {
  app.command('/cc-register', async ({ command, ack, respond }) => {
    await ack();

    const slackUserId = command.user_id;
    const slackUsername = command.user_name;

    try {
      // Check if already registered
      const existing = getPartyBySlackId(slackUserId);
      if (existing) {
        await respond({
          response_type: 'ephemeral',
          blocks: successMessage(
            'Already Registered',
            `You're already registered as \`${existing.cantonParty}\`. You're good to go!`
          ),
        });
        return;
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

      // Create UserIdentity contract on Canton
      await createContract(getOperatorParty(), 'UserIdentity', {
        operator: getOperatorParty(),
        user: cantonParty,
        slackUserId,
        slackUsername,
        registeredAt: new Date().toISOString(),
      });

      // Save mapping locally
      savePartyMapping({
        slackUserId,
        slackUsername,
        cantonParty,
        registeredAt: new Date().toISOString(),
      });

      await respond({
        response_type: 'ephemeral',
        blocks: successMessage(
          'Welcome to ConfidentialConnect!',
          `Your private Canton identity is ready: \`${cantonParty}\`\n\n` +
            '*What you can do now:*\n' +
            '> `/cc-commit <label>` - Commit a secret hash (Verify mode)\n' +
            '> `/cc-send <label> @user` - Send a secret securely (Share mode)\n' +
            '> `/cc-status` - View your dashboard'
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
