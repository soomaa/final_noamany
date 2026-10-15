import { createHmac } from 'crypto';

/** HMAC-SHA256 signature: sha256=<hex> over "{timestamp}.{rawBody}". */
export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `sha256=${digest}`;
}

export const WEBHOOK_EVENT_TYPES = [
  'member_checked_in',
  'subscription_created',
  'subscription_renewed',
  'subscription_payment',
  'class_enrolled',
  'class_waitlisted',
  '*',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
