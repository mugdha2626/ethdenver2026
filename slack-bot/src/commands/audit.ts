/**
 * /cc-audit - Auditor view of shared verification proofs
 * Shows only what has been explicitly shared with this user
 */

import type { App } from '@slack/bolt';
import { queryContracts } from '../services/canton';
import { getPartyBySlackId, getSlackIdByParty } from '../stores/party-mapping';
import { errorMessage, auditTable } from '../utils/slack-blocks';

export function auditCommand(app: App): void {
  app.command('/cc-audit', async ({ command, ack, respond }) => {
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
      // Query SharedProof contracts where this user is the recipient
      const proofs = await queryContracts(
        mapping.cantonParty,
        'SharedProof',
        { recipient: mapping.cantonParty }
      );

      const formattedProofs = proofs.map((proof) => {
        const payload = proof.payload as Record<string, any>;
        const ownerParty = payload.owner as string;
        const ownerMapping = getSlackIdByParty(ownerParty);
        const ownerDisplay = ownerMapping
          ? `<@${ownerMapping.slackUserId}>`
          : ownerParty;

        return {
          owner: ownerDisplay,
          service: payload.service,
          status: payload.status,
          responseId: payload.responseId,
          sharedAt: payload.sharedAt,
        };
      });

      await respond({
        response_type: 'ephemeral',
        blocks: auditTable(formattedProofs),
      });
    } catch (err) {
      console.error('Audit error:', err);
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Audit Error',
          `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
        ),
      });
    }
  });
}
