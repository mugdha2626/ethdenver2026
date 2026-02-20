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
  app.action('acknowledge_transfer', async ({ ack, body, respond }) => {
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

      // Replace the original message — removes the secret from screen
      await respond({
        replace_original: true,
        text: 'Secret acknowledged and archived!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Secret acknowledged and archived!*\n\nThe Canton contract has been archived. The secret no longer exists on the ledger.\n\nOnly you have it now. No Slack logs. No Canton record. Gone.',
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Archived at ${new Date().toISOString()}` },
              { type: 'mrkdwn', text: 'Powered by Canton sub-transaction privacy' },
            ],
          },
        ],
      });
    } catch (err) {
      console.error('Acknowledge error:', err);
      await respond({
        replace_original: false,
        text: `Error acknowledging: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  });
}
