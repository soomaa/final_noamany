import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

const EGYPT_TZ = 'Africa/Cairo';

/** Local calendar date YYYY-MM-DD (Egypt), not UTC. */
export function localDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EGYPT_TZ }).format(date);
}

export function toNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

/**
 * Computed registration-open flag: NOT stored on club_events. True when the event is published,
 * `now` (local date) falls within [registration_opens, registration_closes] (open-ended when a
 * bound is null), registration isn't manually paused, and total capacity (registrations + waitlist
 * cap) isn't fully exhausted. Mirrors the Part III contract — "registration open/closed is a
 * computed getter in the service response, never stored."
 */
export function computeRegistrationOpen(event: {
  status: string;
  registration_opens: string | null;
  registration_closes: string | null;
  registration_paused: boolean;
  max_capacity: number;
  waitlist_capacity: number;
  registrations_count: number;
}): boolean {
  if (event.status !== 'published') return false;
  if (event.registration_paused) return false;
  const today = localDateString();
  if (event.registration_opens && today < event.registration_opens) return false;
  if (event.registration_closes && today > event.registration_closes) return false;
  const totalCapacity =
    event.max_capacity > 0 ? event.max_capacity + event.waitlist_capacity : Infinity;
  if (totalCapacity !== Infinity && event.registrations_count >= totalCapacity) return false;
  return true;
}

/** EVT-YYYY-#### with a 4-digit zero-padded sequence, scoped per calendar year. */
export function buildEventNumber(year: number, seq: number): string {
  return `EVT-${year}-${String(seq).padStart(4, '0')}`;
}

export function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Random unlikely-to-collide check-in code (24 hex chars from 12 random bytes). */
export function genCheckinCode(): string {
  return randomBytes(12).toString('hex');
}
