/**
 * Per-secret timer manager
 * Tracks DM messages for sent secrets and auto-expires them via chat.update
 */

import type { App } from '@slack/bolt';
import { formatTimeRemaining, inboxItemWithLink, expiredSecretMessage } from '../utils/slack-blocks';
import { revokeTokensForContract } from './view-tokens';

interface TrackedSecret {
  messageTs: string;
  channelId: string;
  label: string;
  senderDisplay: string;
  expiresAt: string | null;
  timerId: ReturnType<typeof setInterval> | null;
  // Context needed to rebuild blocks on each tick (NO secret — it stays on Canton only)
  description: string;
  sentAt: string;
  viewUrl: string;
}

const tracked = new Map<string, TrackedSecret>();
let slackClient: App['client'] | null = null;

/** Save Slack client ref — call once from index.ts */
export function initTimerManager(client: App['client']): void {
  slackClient = client;
}

/** Choose refresh interval based on time remaining */
function refreshInterval(expiresAt: string): number {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 5 * 60_000) return 30_000;       // <5min: every 30s
  if (remaining <= 60 * 60_000) return 60_000;       // <1hr: every 60s
  if (remaining <= 24 * 60 * 60_000) return 5 * 60_000; // <24hr: every 5min
  return 30 * 60_000;                                 // otherwise: every 30min
}

/** Rebuild the DM blocks with an updated countdown and push via chat.update */
async function tick(contractId: string): Promise<void> {
  const entry = tracked.get(contractId);
  if (!entry || !slackClient) return;

  const now = Date.now();
  const expired = entry.expiresAt && new Date(entry.expiresAt).getTime() <= now;

  try {
    if (expired) {
      // Final update: replace DM with expired notice
      revokeTokensForContract(contractId);
      await slackClient.chat.update({
        channel: entry.channelId,
        ts: entry.messageTs,
        blocks: expiredSecretMessage(entry.label, entry.senderDisplay) as any[],
        text: `Secret '${entry.label}' has expired`,
      });
      untrackSecret(contractId);
    } else {
      // Rebuild blocks with fresh countdown using link-based layout (no secret content)
      const blocks = inboxItemWithLink(
        entry.senderDisplay,
        entry.label,
        entry.description,
        entry.sentAt,
        contractId,
        entry.viewUrl,
        entry.expiresAt
      );
      await slackClient.chat.update({
        channel: entry.channelId,
        ts: entry.messageTs,
        blocks: blocks as any[],
        text: `Secret '${entry.label}' from ${entry.senderDisplay}`,
      });

      // Adjust interval if we crossed a threshold
      if (entry.timerId && entry.expiresAt) {
        const newInterval = refreshInterval(entry.expiresAt);
        const remaining = new Date(entry.expiresAt).getTime() - Date.now();
        // If remaining < 5min and current interval isn't 30s, reschedule
        if (remaining <= 5 * 60_000) {
          clearInterval(entry.timerId);
          entry.timerId = setInterval(() => tick(contractId), newInterval);
        }
      }
    }
  } catch (err) {
    console.error(`[secret-timers] chat.update failed for ${contractId}:`, err);
    untrackSecret(contractId);
  }
}

/** Track a sent secret's DM message and optionally start an expiration timer */
export function trackSecret(
  contractId: string,
  messageTs: string,
  channelId: string,
  label: string,
  senderDisplay: string,
  expiresAt: string | null,
  description: string,
  sentAt: string,
  viewUrl: string
): void {
  let timerId: ReturnType<typeof setInterval> | null = null;

  if (expiresAt) {
    const interval = refreshInterval(expiresAt);
    timerId = setInterval(() => tick(contractId), interval);
  }

  tracked.set(contractId, {
    messageTs,
    channelId,
    label,
    senderDisplay,
    expiresAt,
    timerId,
    description,
    sentAt,
    viewUrl,
  });
}

/** Cancel timer and remove entry (called on acknowledge) */
export function untrackSecret(contractId: string): void {
  const entry = tracked.get(contractId);
  if (entry?.timerId) {
    clearInterval(entry.timerId);
  }
  tracked.delete(contractId);
}

/** Get tracked secret metadata (for acknowledge handler) */
export function getTrackedSecret(contractId: string): { messageTs: string; channelId: string } | null {
  const entry = tracked.get(contractId);
  if (!entry) return null;
  return { messageTs: entry.messageTs, channelId: entry.channelId };
}

/** Clear all timers — call on shutdown */
export function clearAllTimers(): void {
  for (const [, entry] of tracked) {
    if (entry.timerId) clearInterval(entry.timerId);
  }
  tracked.clear();
}
