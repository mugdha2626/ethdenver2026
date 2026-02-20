/**
 * /cc-verify <label> - Live-verify a secret via external API
 * Opens a modal to re-enter the secret (we never store it)
 */

import type { App } from '@slack/bolt';
import { fetchByKey, exerciseChoice, getOperatorParty } from '../services/canton';
import { verifyCommitment } from '../services/crypto';
import { getSalt } from '../stores/salt-store';
import { getPartyBySlackId } from '../stores/party-mapping';
import { getVerifier, getAvailableServices, detectService } from '../services/verifiers';
import { successMessage, errorMessage, section, context, divider, notifyUser } from '../utils/slack-blocks';

export function verifyCommand(app: App): void {
  app.command('/cc-verify', async ({ command, ack, client, respond }) => {
    await ack();

    const mapping = getPartyBySlackId(command.user_id);
    if (!mapping) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage('Not Registered', 'Please run `/cc-register` first.'),
      });
      return;
    }

    const label = command.text.trim();
    if (!label) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'Missing Label',
          `Usage: \`/cc-verify <label>\`\nExample: \`/cc-verify aws\`\n\nAvailable services: ${getAvailableServices().join(', ')}`
        ),
      });
      return;
    }

    // Check commitment exists
    const commitment = await fetchByKey(mapping.cantonParty, 'SecretCommitment', [
      mapping.cantonParty,
      label,
    ]);
    if (!commitment) {
      await respond({
        response_type: 'ephemeral',
        blocks: errorMessage(
          'No Commitment Found',
          `No secret committed with label \`${label}\`. Run \`/cc-commit ${label}\` first.`
        ),
      });
      return;
    }

    // Open modal for secret re-entry
    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'verify_secret_modal',
        private_metadata: JSON.stringify({
          label,
          channelId: command.channel_id,
          contractId: commitment.contractId,
        }),
        title: { type: 'plain_text', text: 'Verify Secret' },
        submit: { type: 'plain_text', text: 'Verify' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `*Verifying secret for label:* \`${label}\`\n\n` +
                'Re-enter your secret to verify it against the live API. ' +
                'The secret will be used once and immediately discarded.',
            },
          },
          {
            type: 'input',
            block_id: 'secret_input',
            label: { type: 'plain_text', text: 'Secret' },
            element: {
              type: 'plain_text_input',
              action_id: 'secret_value',
              placeholder: { type: 'plain_text', text: 'Re-enter your API key or secret...' },
              multiline: false,
            },
          },
          {
            type: 'input',
            block_id: 'service_input',
            label: { type: 'plain_text', text: 'Service' },
            element: {
              type: 'static_select',
              action_id: 'service_value',
              placeholder: { type: 'plain_text', text: 'Select service...' },
              options: getAvailableServices().map((s) => ({
                text: { type: 'plain_text' as const, text: s.toUpperCase() },
                value: s,
              })),
            },
            optional: true,
          },
        ],
      },
    });
  });

  // Handle modal submission
  app.view('verify_secret_modal', async ({ ack, view, body }) => {
    await ack();

    const { label, channelId, contractId } = JSON.parse(view.private_metadata);
    const secret = view.state.values.secret_input.secret_value.value!;
    const selectedService = view.state.values.service_input?.service_value?.selected_option?.value;
    const slackUserId = body.user.id;

    const mapping = getPartyBySlackId(slackUserId);
    if (!mapping) return;

    try {
      // Step 1: Verify the secret matches the commitment hash
      const saltEntry = getSalt(mapping.cantonParty, label);
      if (!saltEntry) {
        await notifyUser(app.client, slackUserId, errorMessage('Salt Not Found', 'Internal error: salt missing for this commitment.'), channelId);
        return;
      }

      // Fetch the commitment to get the stored hash
      const commitment = await fetchByKey(mapping.cantonParty, 'SecretCommitment', [
        mapping.cantonParty,
        label,
      ]);
      if (!commitment) {
        await notifyUser(app.client, slackUserId, errorMessage('Commitment Not Found', 'The commitment was not found on Canton.'), channelId);
        return;
      }

      const storedHash = commitment.payload.commitment as string;
      const hashMatches = verifyCommitment(secret, saltEntry.salt, storedHash);

      if (!hashMatches) {
        await notifyUser(app.client, slackUserId, errorMessage(
          'Hash Mismatch',
          'The secret you entered does not match the committed hash. Make sure you entered the exact same secret.'
        ), channelId);
        return;
      }

      // Step 2: Detect or use selected service
      const serviceName = selectedService || detectService(secret) || label;
      const verifier = getVerifier(serviceName);

      if (!verifier) {
        await notifyUser(app.client, slackUserId, errorMessage(
          'Unknown Service',
          `No verifier found for \`${serviceName}\`. Available: ${getAvailableServices().join(', ')}`
        ), channelId);
        return;
      }

      // Step 3: Call the live external API
      const result = await verifier.verify(secret);

      // Secret is garbage collected after this point

      // Step 4: Record result on Canton
      const status = result.success ? 'Passed' : 'Failed';
      await exerciseChoice(
        getOperatorParty(),
        'SecretCommitment',
        contractId,
        'RecordVerification',
        {
          status,
          metadata: {
            service: serviceName,
            apiEndpoint: result.apiEndpoint,
            responseId: result.responseId,
            permissions: result.permissions,
            verifiedAt: new Date().toISOString(),
          },
        }
      );

      // Step 5: Report to user
      if (result.success) {
        await notifyUser(app.client, slackUserId, [
          ...successMessage(
            `${serviceName.toUpperCase()} Verified!`,
            `*Status:* Passed\n*Account/ID:* \`${result.responseId}\`\n*Permissions:* ${result.permissions.join(', ')}\n*API:* \`${result.apiEndpoint}\``
          ),
          divider(),
          section(
            `Next: \`/cc-prove ${label} @auditor\` to share this result (not the secret) with someone.`
          ),
        ], channelId);
      } else {
        await notifyUser(app.client, slackUserId, errorMessage(
          `${serviceName.toUpperCase()} Verification Failed`,
          `*Error:* ${result.error}\n*API:* \`${result.apiEndpoint}\``
        ), channelId);
      }
    } catch (err) {
      console.error('Verify error:', err);
      await notifyUser(app.client, slackUserId, errorMessage(
        'Verification Error',
        `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      ), channelId);
    }
  });
}
