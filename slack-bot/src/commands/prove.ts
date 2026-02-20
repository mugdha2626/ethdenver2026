/**
 * /cc-prove <label> @user - Share a verification result with someone
 * The recipient sees the result (pass/fail, account ID) but NEVER the secret
 */

import type { App } from '@slack/bolt';
import { fetchByKey, exerciseChoice, getOperatorParty } from '../services/canton';
import { getPartyBySlackId } from '../stores/party-mapping';
import { successMessage, errorMessage } from '../utils/slack-blocks';

export function proveCommand(app: App): void {
  app.command('/cc-prove', async ({ command, ack, client, respond }) => {
    await ack();

    const mapping = getPartyBySlackId(command.user_id);
    if (!mapping) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage('Not Registered', 'Please run `/cc-register` first.'),
      });
      return;
    }

    // Parse: /cc-prove <label> @user [purpose]
    const parts = command.text.trim().split(/\s+/);
    if (parts.length < 2) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Usage',
          '`/cc-prove <label> @user [purpose]`\nExample: `/cc-prove aws @auditor Quarterly audit`'
        ),
      });
      return;
    }

    const label = parts[0];
    const userMention = parts[1];

    // Try <@USERID> format first
    let recipientSlackId: string | null = null;
    let purposeStartIdx = 2;
    const recipientMatch = userMention.match(/<@(\w+)(?:\|[^>]+)?>/);
    if (recipientMatch) {
      recipientSlackId = recipientMatch[1];
    } else {
      // Fall back: search by name
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

    const purpose = parts.slice(purposeStartIdx).join(' ') || 'Shared verification proof';

    // Check recipient is registered
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

    try {
      // Find the verification result
      const verResult = await fetchByKey(mapping.cantonParty, 'VerificationResult', [
        getOperatorParty(),
        mapping.cantonParty,
        label,
      ]);

      if (!verResult) {
        await respond({
          response_type: 'ephemeral',
          blocks: errorMessage(
            'No Verification Found',
            `No verification result for \`${label}\`. Run \`/cc-verify ${label}\` first.`
          ),
        });
        return;
      }

      // Exercise ShareProof choice
      await exerciseChoice(
        mapping.cantonParty,
        'VerificationResult',
        verResult.contractId,
        'ShareProof',
        {
          recipient: recipientMapping.cantonParty,
          purpose,
          sharedAt: new Date().toISOString(),
        }
      );

      // Notify the sharer
      await respond({
        response_type: 'ephemeral',
        blocks: successMessage(
          'Proof Shared',
          `Shared verification result for \`${label}\` with <@${recipientSlackId}>.\n\n` +
            `They can see: *${(verResult.payload.status as string)}* | \`${(verResult.payload.metadata as Record<string, string>).responseId}\`\n` +
            `They *cannot* see: your secret or its hash.\n\n` +
            `Canton enforces this at the protocol level -- the secret data literally doesn't exist on their node.`
        ),
      });

      // DM the recipient
      try {
        await client.chat.postMessage({
          channel: recipientSlackId,
          blocks: successMessage(
            'Proof Shared With You',
            `<@${command.user_id}> shared a verification proof with you.\n\n` +
              `*Label:* \`${label}\`\n` +
              `*Service:* ${(verResult.payload.metadata as Record<string, string>).service}\n` +
              `*Status:* ${verResult.payload.status}\n` +
              `*Account:* \`${(verResult.payload.metadata as Record<string, string>).responseId}\`\n` +
              `*Purpose:* ${purpose}\n\n` +
              `View all proofs shared with you: \`/cc-audit\``
          ),
        });
      } catch {
        // DM may fail if bot doesn't have DM access
        console.warn(`Could not DM ${recipientSlackId}`);
      }
    } catch (err) {
      console.error('Prove error:', err);
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Share Failed',
          `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
        ),
      });
    }
  });
}
