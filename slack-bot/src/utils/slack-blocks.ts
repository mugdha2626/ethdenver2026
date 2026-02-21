/**
 * Reusable Slack Block Kit builders for Cloak
 */

import type { App } from '@slack/bolt';
import type { KnownBlock, Block } from '@slack/types';

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
    context('If this persists, try /cloak-register first'),
  ];
}

/** Format remaining time until expiration in a human-readable string */
export function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Expires in less than a minute';
  if (minutes < 60) return `Expires in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

/** Build the inbox view for /cloak-inbox */
/** Build the "secret expired" replacement message for a DM */
export function expiredSecretMessage(label: string, senderDisplay: string): AnyBlock[] {
  return [
    header('Secret Expired'),
    section(
      `The secret \`${label}\` from ${senderDisplay} has expired and is no longer available.\n\n` +
        'The Canton contract will be archived automatically.'
    ),
    context('Expired secrets cannot be retrieved.', 'Powered by Canton sub-transaction privacy'),
  ];
}

export function inboxItem(
  sender: string,
  label: string,
  description: string,
  sentAt: string,
  contractId: string,
  expiresAt?: string | null
): AnyBlock[] {
  const blocks: AnyBlock[] = [
    section(`*From:* ${sender}\n*Label:* \`${label}\`\n*Description:* ${description}\n*Sent:* ${sentAt}`),
  ];

  if (expiresAt) {
    blocks.push(context(`_${formatTimeRemaining(expiresAt)}_`));
  }

  blocks.push(
    actions(`ack-${contractId}`, {
      text: 'View Secret',
      actionId: 'view_secret',
      value: contractId,
    }, {
      text: 'Acknowledge Receipt',
      actionId: 'acknowledge_transfer',
      value: contractId,
      style: 'primary',
    }),
    divider(),
  );

  return blocks;
}

/** Build inbox item with a one-time web link instead of a "View Secret" button */
export function inboxItemWithLink(
  sender: string,
  label: string,
  description: string,
  sentAt: string,
  contractId: string,
  viewUrl: string,
  expiresAt?: string | null
): AnyBlock[] {
  const blocks: AnyBlock[] = [
    section(
      `*From:* ${sender}\n*Label:* \`${label}\`\n*Description:* ${description}\n*Sent:* ${sentAt}\n\n` +
      `<${viewUrl}|Open Secret> — _one-time link, opens in browser_`
    ),
  ];

  if (expiresAt) {
    blocks.push(context(`_${formatTimeRemaining(expiresAt)}_`));
  }

  blocks.push(
    actions(`ack-${contractId}`, {
      text: 'Acknowledge Receipt',
      actionId: 'acknowledge_transfer',
      value: contractId,
      style: 'primary',
    }),
    divider(),
  );

  return blocks;
}

