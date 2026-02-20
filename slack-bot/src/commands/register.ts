/**
 * /cc-register - Register a Slack user as a Canton party
 */

import type { App } from '@slack/bolt';
import { allocateParty, createContract } from '../services/canton';
import { savePartyMapping, getPartyBySlackId } from '../stores/party-mapping';
import { successMessage, errorMessage } from '../utils/slack-blocks';

const OPERATOR_PARTY = process.env.CANTON_OPERATOR_PARTY || 'operator';

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

      // Allocate a new Canton party
      const partyHint = `user-${slackUserId}`;
      const cantonParty = await allocateParty(partyHint, slackUsername);

      // Create UserIdentity contract on Canton
      await createContract(OPERATOR_PARTY, 'UserIdentity', {
        operator: OPERATOR_PARTY,
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
