/**
 * /cc-status - Overview of all your secrets, verifications, and transfers
 */

import type { App } from '@slack/bolt';
import { queryContracts } from '../services/canton';
import { getPartyBySlackId, getSlackIdByParty } from '../stores/party-mapping';
import { errorMessage, statusOverview } from '../utils/slack-blocks';

export function statusCommand(app: App): void {
  app.command('/cc-status', async ({ command, ack, respond }) => {
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
      // Query all contract types in parallel
      const [commitments, verifications, transfers] = await Promise.all([
        queryContracts(mapping.cantonParty, 'SecretCommitment', {
          owner: mapping.cantonParty,
        }),
        queryContracts(mapping.cantonParty, 'VerificationResult', {
          owner: mapping.cantonParty,
        }),
        queryContracts(mapping.cantonParty, 'SecretTransfer', {
          sender: mapping.cantonParty,
        }),
      ]);

      const formattedCommitments = commitments.map((c) => ({
        label: (c.payload as Record<string, string>).label,
        committedAt: (c.payload as Record<string, string>).committedAt,
      }));

      const formattedVerifications = verifications.map((v) => ({
        label: (v.payload as Record<string, string>).label,
        status: (v.payload as Record<string, string>).status,
        service: ((v.payload as Record<string, any>).metadata as Record<string, string>).service,
      }));

      const formattedTransfers = transfers.map((t) => {
        const payload = t.payload as Record<string, string>;
        const recipientMapping = getSlackIdByParty(payload.recipient);
        return {
          label: payload.label,
          recipient: recipientMapping
            ? `<@${recipientMapping.slackUserId}>`
            : payload.recipient,
          sentAt: payload.sentAt,
        };
      });

      await respond({
        response_type: 'ephemeral',
        blocks: statusOverview(
          formattedCommitments,
          formattedVerifications,
          formattedTransfers
        ),
      });
    } catch (err) {
      console.error('Status error:', err);
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Status Error',
          `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
        ),
      });
    }
  });
}
