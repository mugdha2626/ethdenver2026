/**
 * Reusable Slack Block Kit builders for ConfidentialConnect
 */

import type { KnownBlock, Block, App } from '@slack/bolt';

type AnyBlock = KnownBlock | Block;

/**
 * Safely send a message to a user from a view handler.
 * Tries chat.postEphemeral in the original channel first,
 * falls back to a DM if the bot doesn't have channel access.
 */
export async function notifyUser(
  client: App['client'],
  userId: string,
  blocks: AnyBlock[],
  channelId?: string
): Promise<void> {
  if (channelId) {
    try {
      await client.chat.postEphemeral({ channel: channelId, user: userId, blocks });
      return;
    } catch {
      // Channel not accessible — fall through to DM
    }
  }
  // Fallback: DM the user directly
  await client.chat.postMessage({ channel: userId, blocks });
}

/** Build a section block with markdown text */
export function section(text: string): AnyBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text },
  };
}

/** Build a divider block */
export function divider(): AnyBlock {
  return { type: 'divider' };
}

/** Build a header block */
export function header(text: string): AnyBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  };
}

/** Build a context block (small grey text) */
export function context(...texts: string[]): AnyBlock {
  return {
    type: 'context',
    elements: texts.map((t) => ({ type: 'mrkdwn', text: t })),
  };
}

/** Build an actions block with buttons */
export function actions(
  blockId: string,
  ...buttons: { text: string; actionId: string; value?: string; style?: 'primary' | 'danger' }[]
): AnyBlock {
  return {
    type: 'actions',
    block_id: blockId,
    elements: buttons.map((b) => ({
      type: 'button',
      text: { type: 'plain_text', text: b.text, emoji: true },
      action_id: b.actionId,
      ...(b.value ? { value: b.value } : {}),
      ...(b.style ? { style: b.style } : {}),
    })),
  };
}

/** Success message wrapper */
export function successMessage(title: string, details: string): AnyBlock[] {
  return [
    header(`${title}`),
    section(details),
    context('Powered by Canton sub-transaction privacy'),
  ];
}

/** Error message wrapper */
export function errorMessage(title: string, details: string): AnyBlock[] {
  return [
    section(`*${title}*\n${details}`),
    context('If this persists, try /cc-register first'),
  ];
}

/** Build the inbox view for /cc-inbox */
export function inboxItem(
  sender: string,
  label: string,
  description: string,
  secret: string,
  sentAt: string,
  contractId: string
): AnyBlock[] {
  return [
    section(`*From:* ${sender}\n*Label:* \`${label}\`\n*Description:* ${description}\n*Sent:* ${sentAt}`),
    section(`*Secret:*\n\`\`\`${secret}\`\`\``),
    actions(`ack-${contractId}`, {
      text: 'Acknowledge Receipt',
      actionId: 'acknowledge_transfer',
      value: contractId,
      style: 'primary',
    }),
    divider(),
  ];
}

