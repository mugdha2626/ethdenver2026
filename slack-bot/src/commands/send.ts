/**
 * /cc-send <label> @user - Send an actual secret to someone via Canton
 * The secret travels through Canton's privacy protocol, not through Slack
 */

import type { App } from '@slack/bolt';
import { createContract, getOperatorParty } from '../services/canton';
import { getPartyBySlackId } from '../stores/party-mapping';
import { successMessage, errorMessage } from '../utils/slack-blocks';

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

    // Try <@USERID> format first (proper Slack mention)
    let recipientSlackId: string | null = null;
    const recipientMatch = userMention.match(/<@(\w+)(?:\|[^>]+)?>/);
    if (recipientMatch) {
      recipientSlackId = recipientMatch[1];
    } else {
      // Fall back: search for user by name/display name
      const cleanName = userMention.replace(/^@/, '').trim();
      try {
        const usersRes = await client.users.list({});
        const found = usersRes.members?.find(
          (m) =>
            m.name?.toLowerCase() === cleanName.toLowerCase() ||
            m.real_name?.toLowerCase() === cleanName.toLowerCase() ||
            m.profile?.display_name?.toLowerCase() === cleanName.toLowerCase()
        );
        if (found?.id) {
          recipientSlackId = found.id;
        }
      } catch {
        // users.list failed
      }
    }

    if (!recipientSlackId) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'User Not Found',
          `Could not find user "${userMention}". Try mentioning them with @ or check the spelling.`
        ),
      });
      return;
    }
    const recipientMapping = getPartyBySlackId(recipientSlackId);
    if (!recipientMapping) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Recipient Not Registered',
          `<@${recipientSlackId}> hasn't registered yet. Ask them to run \`/cc-register\` first.`
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
    const slackUserId = body.user.id;

    const mapping = getPartyBySlackId(slackUserId);
    if (!mapping) return;

    try {
      // Create SecretTransfer contract on Canton
      // ONLY sender and recipient nodes receive this data
      await createContract(mapping.cantonParty, 'SecretTransfer', {
        sender: mapping.cantonParty,
        recipient: recipientParty,
        operator: getOperatorParty(),
        label,
        encryptedSecret: secret,
        description,
        sentAt: new Date().toISOString(),
        expiresAt: null,
      });

      // Notify sender
      await app.client.chat.postEphemeral({
        channel: channelId,
        user: slackUserId,
        blocks: successMessage(
          'Secret Sent',
          `Secret \`${label}\` sent to <@${recipientSlackId}>.\n\n` +
            '*Only you and the recipient can see this on Canton.* No other node on the network received this data.\n\n' +
            `The recipient can type \`/cc-inbox\` to retrieve it.`
        ),
      });

      // DM the recipient
      try {
        await app.client.chat.postMessage({
          channel: recipientSlackId,
          blocks: successMessage(
            'Secret Received',
            `<@${slackUserId}> sent you a secret labeled \`${label}\`.\n\n` +
              `Type \`/cc-inbox\` to view and acknowledge it.\n\n` +
              `_This secret is stored on Canton and visible only to you and the sender. It will be removed after you acknowledge._`
          ),
        });
      } catch {
        console.warn(`Could not DM ${recipientSlackId}`);
      }
    } catch (err) {
      console.error('Send error:', err);
      await app.client.chat.postEphemeral({
        channel: channelId,
        user: slackUserId,
        blocks: errorMessage(
          'Send Failed',
          `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
        ),
      });
    }
  });
}
