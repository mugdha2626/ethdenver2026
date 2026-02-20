/**
 * /cc-inbox - View secrets shared with you
 * Shows secrets in ephemeral messages (only you see them)
 */

import type { App } from '@slack/bolt';
import { queryContracts, exerciseChoice } from '../services/canton';
import { getPartyBySlackId, getSlackIdByParty } from '../stores/party-mapping';
import { errorMessage, header, inboxItemWithLink, section, context, divider } from '../utils/slack-blocks';
import { getTrackedSecret, untrackSecret } from '../stores/secret-timers';
import { createViewToken, revokeTokensForContract } from '../stores/view-tokens';

const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3100';

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

      // Separate expired and active transfers
      const now = new Date();
      const active: typeof transfers = [];

      for (const transfer of transfers) {
        const payload = transfer.payload as Record<string, any>;
        const expiresAt = payload.expiresAt as string | null;
        if (expiresAt && new Date(expiresAt) < now) {
          // Expired — try to archive on Canton, but don't block on failure
          try {
            await exerciseChoice(
              mapping.cantonParty,
              'SecretTransfer',
              transfer.contractId,
              'RevokeTransfer',
              {}
            );
          } catch {
            // Operator may not have authority; just hide client-side
          }
          continue;
        }
        active.push(transfer);
      }

      if (active.length === 0) {
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

      // Build inbox view — NO secret content, just metadata + one-time links
      const blocks: any[] = [header('Your Inbox'), divider()];

      for (const transfer of active) {
        const payload = transfer.payload as Record<string, any>;
        const senderParty = payload.sender as string;
        const senderMapping = getSlackIdByParty(senderParty);
        const senderDisplay = senderMapping
          ? `<@${senderMapping.slackUserId}>`
          : senderParty;

        const viewToken = createViewToken(
          transfer.contractId,
          mapping.cantonParty,
          command.user_id,
          payload.expiresAt || null
        );
        const viewUrl = `${webBaseUrl}/secret/${viewToken}`;

        blocks.push(
          ...inboxItemWithLink(
            senderDisplay,
            payload.label,
            payload.description,
            payload.sentAt,
            transfer.contractId,
            viewUrl,
            payload.expiresAt
          )
        );
      }

      blocks.push(
        context(
          'Secrets are stored *only on Canton* — they never touch Slack.',
          'Click the link to view each secret in your browser (one-time use).'
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

  // Handle "View Secret" button — backward compat for old-style buttons.
  // Generates a one-time token and DMs the user a link instead of opening a modal.
  app.action('view_secret', async ({ ack, body, client }) => {
    await ack();

    if (body.type !== 'block_actions' || !body.actions[0]) return;

    const action = body.actions[0] as { value?: string };
    const contractId = action.value;
    const slackUserId = body.user.id;

    const mapping = getPartyBySlackId(slackUserId);
    if (!mapping || !contractId) return;

    try {
      // Verify the contract still exists
      const transfers = await queryContracts(
        mapping.cantonParty,
        'SecretTransfer',
        { recipient: mapping.cantonParty }
      );

      const transfer = transfers.find((t) => t.contractId === contractId);
      if (!transfer) {
        await client.chat.postMessage({
          channel: slackUserId,
          text: 'This secret may have expired or already been acknowledged.',
        });
        return;
      }

      const payload = transfer.payload as Record<string, any>;
      const viewToken = createViewToken(
        contractId,
        mapping.cantonParty,
        slackUserId,
        payload.expiresAt || null
      );
      const viewUrl = `${webBaseUrl}/secret/${viewToken}`;

      await client.chat.postMessage({
        channel: slackUserId,
        text: `Open this one-time link to view your secret: ${viewUrl}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Secret:* \`${payload.label}\`\n\n<${viewUrl}|Open Secret> — _one-time link, opens in browser_`,
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: 'This link can only be used once. The secret never passes through Slack.' },
            ],
          },
        ],
      });
    } catch (err) {
      console.error('View secret error:', err);
    }
  });

  // Handle Acknowledge button (works for both DM push and ephemeral inbox)
  app.action('acknowledge_transfer', async ({ ack, body, client, respond }) => {
    await ack();

    if (body.type !== 'block_actions' || !body.actions[0]) return;

    const action = body.actions[0] as { value?: string };
    const contractId = action.value;
    const slackUserId = body.user.id;

    const mapping = getPartyBySlackId(slackUserId);
    if (!mapping || !contractId) return;

    const acknowledgedBlocks = [
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: '*Secret acknowledged and archived!*\n\nThe Canton contract has been archived. The secret no longer exists on the ledger.\n\nOnly you have it now. No Slack logs. No Canton record. Gone.',
        },
      },
      {
        type: 'context' as const,
        elements: [
          { type: 'mrkdwn' as const, text: `Archived at ${new Date().toISOString()}` },
          { type: 'mrkdwn' as const, text: 'Powered by Canton sub-transaction privacy' },
        ],
      },
    ];

    try {
      // Exercise Acknowledge choice -> archives the contract
      await exerciseChoice(
        mapping.cantonParty,
        'SecretTransfer',
        contractId,
        'Acknowledge',
        {}
      );

      // Revoke any outstanding view tokens for this contract
      revokeTokensForContract(contractId);

      // Try to update the tracked DM message directly
      const trackedEntry = getTrackedSecret(contractId);
      if (trackedEntry) {
        await client.chat.update({
          channel: trackedEntry.channelId,
          ts: trackedEntry.messageTs,
          blocks: acknowledgedBlocks,
          text: 'Secret acknowledged and archived!',
        });
        untrackSecret(contractId);
      } else {
        // Fallback: bot may have restarted (timers lost), or came from ephemeral inbox
        // Try respond() for ephemeral messages, fall back to a new DM
        try {
          await respond({
            replace_original: true,
            text: 'Secret acknowledged and archived!',
            blocks: acknowledgedBlocks,
          });
        } catch {
          await client.chat.postMessage({
            channel: slackUserId,
            blocks: acknowledgedBlocks,
            text: 'Secret acknowledged and archived!',
          });
        }
      }
    } catch (err) {
      console.error('Acknowledge error:', err);
      try {
        await respond({
          replace_original: false,
          text: `Error acknowledging: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      } catch {
        await client.chat.postMessage({
          channel: slackUserId,
          text: `Error acknowledging: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    }
  });
}
