/**
 * /cc-inbox - View secrets shared with you
 * Shows secrets in ephemeral messages (only you see them)
 */

import type { App } from '@slack/bolt';
import { queryContracts, exerciseChoice } from '../services/canton';
import { getPartyBySlackId, getSlackIdByParty } from '../stores/party-mapping';
import { errorMessage, header, inboxItem, section, context, divider } from '../utils/slack-blocks';

export function inboxCommand(app: App): void {
  app.command('/cc-inbox', async ({ command, ack, respond }) => {
    await ack();

    const mapping = getPartyBySlackId(command.user_id);
    if (!mapping) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage('Not Registered', 'Please run `/cc-register` first.'),
      });
      return;
    }

    try {
      // Query SecretTransfer contracts where this user is the recipient
      const transfers = await queryContracts(
        mapping.cantonParty,
        'SecretTransfer',
        { recipient: mapping.cantonParty }
      );

      if (transfers.length === 0) {
        await respond({
          response_type: 'ephemeral',
          blocks: [
            header('Your Inbox'),
            section('_No secrets waiting for you._'),
            context('When someone sends you a secret via `/cc-send`, it will appear here.'),
          ],
        });
        return;
      }

      // Build inbox view
      const blocks: any[] = [header('Your Inbox'), divider()];

      for (const transfer of transfers) {
        const payload = transfer.payload as Record<string, any>;
        const senderParty = payload.sender as string;
        const senderMapping = getSlackIdByParty(senderParty);
        const senderDisplay = senderMapping
          ? `<@${senderMapping.slackUserId}>`
          : senderParty;

        blocks.push(
          ...inboxItem(
            senderDisplay,
            payload.label,
            payload.description,
            payload.encryptedSecret,
            payload.sentAt,
            transfer.contractId
          )
        );
      }

      blocks.push(
        context(
          'These secrets are visible *only to you* on Canton.',
          'Click "Acknowledge Receipt" to archive each transfer.'
        )
      );

      await respond({
        response_type: 'ephemeral',
        blocks,
      });
    } catch (err) {
      console.error('Inbox error:', err);
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Inbox Error',
          `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
        ),
      });
    }
  });

  // Handle Acknowledge button
  app.action('acknowledge_transfer', async ({ ack, body, client }) => {
    await ack();

    if (body.type !== 'block_actions' || !body.actions[0]) return;

    const action = body.actions[0] as { value?: string };
    const contractId = action.value;
    const slackUserId = body.user.id;

    const mapping = getPartyBySlackId(slackUserId);
    if (!mapping || !contractId) return;

    try {
      // Exercise Acknowledge choice -> archives the contract
      await exerciseChoice(
        mapping.cantonParty,
        'SecretTransfer',
        contractId,
        'Acknowledge',
        {}
      );

      // Update the message to show acknowledgment
      await client.chat.postEphemeral({
        channel: body.channel?.id || slackUserId,
        user: slackUserId,
        text: 'Secret acknowledged and archived! The secret has been removed from Canton. Only you have it now.',
      });
    } catch (err) {
      console.error('Acknowledge error:', err);
      await client.chat.postEphemeral({
        channel: body.channel?.id || slackUserId,
        user: slackUserId,
        text: `Error acknowledging: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  });
}
