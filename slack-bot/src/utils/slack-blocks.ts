/**
 * Reusable Slack Block Kit builders for ConfidentialConnect
 */

import type { KnownBlock, Block } from '@slack/bolt';

type AnyBlock = KnownBlock | Block;

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

/** Build the audit table for /cc-audit */
export function auditTable(
  proofs: {
    owner: string;
    service: string;
    status: string;
    responseId: string;
    sharedAt: string;
  }[]
): AnyBlock[] {
  if (proofs.length === 0) {
    return [section('_No shared proofs found. Ask someone to share a verification with you using `/cc-prove`._')];
  }

  const blocks: AnyBlock[] = [header('Audit Dashboard')];

  for (const p of proofs) {
    blocks.push(
      section(
        `*${p.owner}* | \`${p.service}\` | *${p.status}* | \`${p.responseId}\` | ${p.sharedAt}`
      )
    );
  }

  blocks.push(
    divider(),
    context(
      'You can see verification results but *never* the actual secrets.',
      'Canton sub-transaction privacy ensures secrets are invisible to non-parties.'
    )
  );

  return blocks;
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

/** Build the status overview for /cc-status */
export function statusOverview(
  commitments: { label: string; committedAt: string }[],
  verifications: { label: string; status: string; service: string }[],
  transfers: { label: string; recipient: string; sentAt: string }[]
): AnyBlock[] {
  const blocks: AnyBlock[] = [header('Your ConfidentialConnect Status')];

  // Commitments section
  blocks.push(section('*Secret Commitments (Verify Mode)*'));
  if (commitments.length === 0) {
    blocks.push(context('No secrets committed yet. Use `/cc-commit <label>` to start.'));
  } else {
    for (const c of commitments) {
      blocks.push(context(`\`${c.label}\` - committed ${c.committedAt}`));
    }
  }

  blocks.push(divider());

  // Verifications section
  blocks.push(section('*Verification Results*'));
  if (verifications.length === 0) {
    blocks.push(context('No verifications yet. Use `/cc-verify <label>` to verify.'));
  } else {
    for (const v of verifications) {
      blocks.push(context(`\`${v.label}\` (${v.service}) - *${v.status}*`));
    }
  }

  blocks.push(divider());

  // Transfers section
  blocks.push(section('*Secret Transfers (Share Mode)*'));
  if (transfers.length === 0) {
    blocks.push(context('No active transfers. Use `/cc-send <label> @user` to share a secret.'));
  } else {
    for (const t of transfers) {
      blocks.push(context(`\`${t.label}\` -> ${t.recipient} - sent ${t.sentAt}`));
    }
  }

  blocks.push(
    divider(),
    context('Powered by Canton sub-transaction privacy')
  );

  return blocks;
}
