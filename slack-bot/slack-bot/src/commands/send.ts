/**
 * /cc-send <label> @user - Send an actual secret to someone via Canton
 * The secret travels through Canton's privacy protocol, not through Slack
 */

import type { App } from '@slack/bolt';
import { createContract, getOperatorParty } from '../services/canton';
import { getPartyBySlackId, getPartyByUsername } from '../stores/party-mapping';
import { successMessage, errorMessage, notifyUser, inboxItem, header, divider, context } from '../utils/slack-blocks';
import { trackSecret } from '../stores/secret-timers';

export function sendCommand(app: App): void {
  app.command('/cc-send', async ({ command, ack, client, respond }) => {
    await ack();

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

    // Open modal for secure secret input
    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'send_secret_modal',
        private_metadata: JSON.stringify({
          label,
          recipientSlackId,
          recipientParty: recipientMapping.cantonParty,
          channelId: command.channel_id,
        }),
        title: { type: 'plain_text', text: 'Send Secret' },
        submit: { type: 'plain_text', text: 'Send Securely' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `*Sending secret \`${label}\` to <@${recipientSlackId}>*\n\n` +
                'The secret will travel through Canton\'s privacy protocol. ' +
                'Only you and the recipient will ever see it -- not even Canton stores it permanently.',
            },
          },
          {
            type: 'input',
            block_id: 'secret_input',
            label: { type: 'plain_text', text: 'Secret' },
            element: {
              type: 'plain_text_input',
              action_id: 'secret_value',
              placeholder: { type: 'plain_text', text: 'Paste the secret here...' },
              multiline: true,
            },
          },
          {
            type: 'input',
            block_id: 'description_input',
            label: { type: 'plain_text', text: 'Description' },
            element: {
              type: 'plain_text_input',
              action_id: 'description_value',
              placeholder: { type: 'plain_text', text: 'e.g., Production AWS key for deployment' },
              multiline: false,
            },
            optional: true,
          },
          {
            type: 'input',
            block_id: 'ttl_input',
            label: { type: 'plain_text', text: 'Expiration' },
            element: {
              type: 'static_select',
              action_id: 'ttl_value',
              placeholder: { type: 'plain_text', text: 'Choose expiration...' },
              initial_option: {
                text: { type: 'plain_text', text: 'No expiration' },
                value: 'none',
              },
              options: [
                { text: { type: 'plain_text', text: 'No expiration' }, value: 'none' },
                { text: { type: 'plain_text', text: '30 seconds' }, value: '30' },
                { text: { type: 'plain_text', text: '5 minutes' }, value: '300' },
                { text: { type: 'plain_text', text: '1 hour' }, value: '3600' },
                { text: { type: 'plain_text', text: '24 hours' }, value: '86400' },
                { text: { type: 'plain_text', text: '7 days' }, value: '604800' },
              ],
            },
            optional: false,
          },
        ],
      },
    });
  });

  // Handle modal submission
  app.view('send_secret_modal', async ({ ack, view, body }) => {
    await ack();

    const { label, recipientSlackId, recipientParty, channelId } = JSON.parse(
      view.private_metadata
    );
    const secret = view.state.values.secret_input.secret_value.value!;
    const description =
      view.state.values.description_input?.description_value?.value || 'No description';
    const ttlSeconds = view.state.values.ttl_input.ttl_value.selected_option?.value || 'none';
    const slackUserId = body.user.id;

    const mapping = getPartyBySlackId(slackUserId);
    if (!mapping) return;

    try {
      // Create SecretTransfer contract on Canton
      // ONLY sender and recipient nodes receive this data
      const sentAt = new Date();
      const expiresAt =
        ttlSeconds !== 'none'
          ? new Date(sentAt.getTime() + Number(ttlSeconds) * 1000).toISOString()
          : null;

      const contractResult = await createContract(mapping.cantonParty, 'SecretTransfer', {
        sender: mapping.cantonParty,
        recipient: recipientParty,
        operator: getOperatorParty(),
        label,
        encryptedSecret: secret,
        description,
        sentAt: sentAt.toISOString(),
        expiresAt,
      });

      const contractId = contractResult.contractId;
      const senderDisplay = `<@${slackUserId}>`;

      // Notify sender
      await notifyUser(app.client, slackUserId, successMessage(
        'Secret Sent',
        `Secret \`${label}\` sent to <@${recipientSlackId}>.\n\n` +
          '*Only you and the recipient can see this on Canton.* No other node on the network received this data.\n\n' +
          `The recipient will receive a DM with the secret.`
      ), channelId);

      // DM the recipient with the full secret + acknowledge button
      try {
        const dmBlocks = [
          header('Secret Received'),
          divider(),
          ...inboxItem(senderDisplay, label, description, secret, sentAt.toISOString(), contractId, expiresAt),
          context(
            'This secret is visible *only to you* on Canton.',
            'Click "Acknowledge Receipt" to archive the transfer.'
          ),
        ];

        const result = await app.client.chat.postMessage({
          channel: recipientSlackId,
          blocks: dmBlocks,
          text: `${senderDisplay} sent you a secret labeled '${label}'`,
        });

        if (result.ts && result.channel) {
          trackSecret(
            contractId,
            result.ts,
            result.channel,
            label,
            senderDisplay,
            expiresAt,
            description,
            secret,
            sentAt.toISOString()
          );
        }
      } catch {
        console.warn(`Could not DM ${recipientSlackId}`);
      }
    } catch (err) {
      console.error('Send error:', err);
      await notifyUser(app.client, slackUserId, errorMessage(
        'Send Failed',
        `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      ), channelId);
    }
  });
}
