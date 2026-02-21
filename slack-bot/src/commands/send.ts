/**
 * /cc-send <label> @user - Send an actual secret to someone via Canton
 *
 * E2E encryption flow: Instead of a Slack modal (which would expose the secret to Slack),
 * this command generates a short-lived compose link. The sender opens the link in their
 * browser, types the secret there, and the browser encrypts it with the recipient's
 * public key before sending. The plaintext secret never touches Slack or our servers.
 */

import type { App } from '@slack/bolt';
import { getPartyBySlackId, getPartyByUsername } from '../stores/party-mapping';
import { hasEncryptionKeys } from '../stores/encryption-keys';
import { createSendToken } from '../stores/send-tokens';
import { errorMessage } from '../utils/slack-blocks';

export function sendCommand(app: App): void {
  app.command('/cc-send', async ({ command, ack, respond }) => {
    await ack();
    const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3100';

    const mapping = getPartyBySlackId(command.user_id);
    if (!mapping) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage('Not Registered', 'Please run `/cc-register` first.'),
      });
      return;
    }

    // Parse: /cc-send <label> @user
    const parts = command.text.trim().split(/\s+/);
    if (parts.length < 2) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Usage',
          '`/cc-send <label> @user`\nExample: `/cc-send aws-prod @bob`'
        ),
      });
      return;
    }

    const label = parts[0];
    // Join remaining parts as the user mention (handles names with spaces)
    const userMention = parts.slice(1).join(' ');

    // Parse recipient: try <@USERID> format first, then fall back to username lookup
    let recipientSlackId: string | null = null;
    let recipientMapping = null;

    const recipientMatch = userMention.match(/<@(\w+)(?:\|[^>]+)?>/);
    if (recipientMatch) {
      recipientSlackId = recipientMatch[1];
      recipientMapping = getPartyBySlackId(recipientSlackId);
    } else {
      // Slack slash commands often pass @user as plain text — look up by username
      const cleanName = userMention.replace(/^@/, '').trim();
      recipientMapping = getPartyByUsername(cleanName);
      if (recipientMapping) {
        recipientSlackId = recipientMapping.slackUserId;
      }
    }

    if (!recipientSlackId || !recipientMapping) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Recipient Not Found',
          `Could not find a registered user for "${userMention}". Make sure they've run \`/cc-register\` first.`
        ),
      });
      return;
    }

    // Check that recipient has set up encryption keys
    if (!hasEncryptionKeys(recipientMapping.cantonParty)) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Recipient Has No Encryption Keys',
          `<@${recipientSlackId}> hasn't set up their encryption keys yet. Ask them to check their DMs for the setup link (sent after \`/cc-register\`).`
        ),
      });
      return;
    }

    // Create a short-lived send token and build compose URL
    const sendToken = createSendToken(
      mapping.cantonParty,
      command.user_id,
      recipientMapping.cantonParty,
      recipientSlackId,
      label
    );

    const composeUrl = `${webBaseUrl}/compose/${sendToken}`;

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*Ready to send secret \`${label}\` to <@${recipientSlackId}>*\n\n` +
              `Open this link to compose and encrypt your secret:\n<${composeUrl}|Compose Secret>\n\n` +
              '_Your secret is encrypted in your browser — it never passes through Slack or our servers._',
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: 'This link expires in 10 minutes.' }],
        },
      ],
    });
  });
}
