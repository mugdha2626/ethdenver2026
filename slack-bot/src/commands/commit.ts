/**
 * /cc-commit <label> - Commit a secret's hash to Canton
 * Opens a Slack modal for secure secret input
 */

import type { App } from '@slack/bolt';
import { createContract, fetchByKey } from '../services/canton';
import { generateSalt, computeCommitment } from '../services/crypto';
import { saveSalt } from '../stores/salt-store';
import { getPartyBySlackId } from '../stores/party-mapping';
import { successMessage, errorMessage } from '../utils/slack-blocks';

const OPERATOR_PARTY = process.env.CANTON_OPERATOR_PARTY || 'operator';

export function commitCommand(app: App): void {
  // Handle the slash command - opens a modal
  app.command('/cc-commit', async ({ command, ack, client }) => {
    await ack();

    const mapping = getPartyBySlackId(command.user_id);
    if (!mapping) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        blocks: errorMessage('Not Registered', 'Please run `/cc-register` first.'),
      });
      return;
    }

    const label = command.text.trim();
    if (!label) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        blocks: errorMessage('Missing Label', 'Usage: `/cc-commit <label>`\nExample: `/cc-commit aws`'),
      });
      return;
    }

    // Open modal for secure secret input
    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'commit_secret_modal',
        private_metadata: JSON.stringify({ label, channelId: command.channel_id }),
        title: { type: 'plain_text', text: 'Commit Secret' },
        submit: { type: 'plain_text', text: 'Commit' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Committing secret for label:* \`${label}\`\n\nPaste your secret below. It will be hashed immediately and *never stored*.`,
            },
          },
          {
            type: 'input',
            block_id: 'secret_input',
            label: { type: 'plain_text', text: 'Secret' },
            element: {
              type: 'plain_text_input',
              action_id: 'secret_value',
              placeholder: { type: 'plain_text', text: 'Paste your API key or secret here...' },
              multiline: false,
            },
          },
        ],
      },
    });
  });

  // Handle modal submission
  app.view('commit_secret_modal', async ({ ack, view, body }) => {
    await ack();

    const { label, channelId } = JSON.parse(view.private_metadata);
    const secret = view.state.values.secret_input.secret_value.value!;
    const slackUserId = body.user.id;

    const mapping = getPartyBySlackId(slackUserId);
    if (!mapping) return;

    try {
      // Check if commitment already exists for this label
      const existing = await fetchByKey(mapping.cantonParty, 'SecretCommitment', [
        mapping.cantonParty,
        label,
      ]);
      if (existing) {
        await app.client.chat.postEphemeral({
          channel: channelId,
          user: slackUserId,
          blocks: errorMessage(
            'Already Committed',
            `A secret with label \`${label}\` already exists. Use a different label or revoke the existing one.`
          ),
        });
        return;
      }

      // Generate salt and compute commitment
      const salt = generateSalt();
      const commitment = computeCommitment(secret, salt);

      // Store salt locally (needed for re-verification)
      saveSalt({
        ownerParty: mapping.cantonParty,
        label,
        salt,
        createdAt: new Date().toISOString(),
      });

      // Create SecretCommitment on Canton
      await createContract(mapping.cantonParty, 'SecretCommitment', {
        owner: mapping.cantonParty,
        operator: OPERATOR_PARTY,
        label,
        commitment,
        committedAt: new Date().toISOString(),
      });

      // Secret is now garbage collected - we only have the hash

      await app.client.chat.postEphemeral({
        channel: channelId,
        user: slackUserId,
        blocks: successMessage(
          'Secret Committed',
          `*Label:* \`${label}\`\n*Hash:* \`${commitment.substring(0, 16)}...\`\n\n` +
            'Your secret was hashed and the original was discarded. Only you can see this commitment on Canton.\n\n' +
            `Next: \`/cc-verify ${label}\` to live-verify it against an external API.`
        ),
      });
    } catch (err) {
      console.error('Commit error:', err);
      await app.client.chat.postEphemeral({
        channel: channelId,
        user: slackUserId,
        blocks: errorMessage(
          'Commit Failed',
          `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
        ),
      });
    }
  });
}
