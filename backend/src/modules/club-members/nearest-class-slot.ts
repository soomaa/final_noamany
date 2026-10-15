/**
 * Reception checks a member into a scheduled class by walking up to the desk — rarely exactly
 * inside the class window. These helpers pick the slot the member is obviously here for:
 * the one running now, otherwise the nearest one on the same day.
 */

export type SchedulableSlot = { startTime: string; endTime: string };

export type SlotPosition = 'now' | 'upcoming' | 'past';

/** "HH:MM" / "HH:MM:SS" → minutes since midnight. */
export function timeToMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function slotProximity(slot: SchedulableSlot, time: string): { position: SlotPosition; distance: number } {
  const now = timeToMinutes(time);
  const start = timeToMinutes(slot.startTime);
  const end = timeToMinutes(slot.endTime);
  if (now >= start && now <= end) return { position: 'now', distance: 0 };
  if (now < start) return { position: 'upcoming', distance: start - now };
  return { position: 'past', distance: now - end };
}

export type ScoredSlot<T> = T & { position: SlotPosition; distance: number };

/**
 * Pick the slot a walk-in belongs to. A running class always wins; otherwise the closest by
 * minutes, preferring the class that has not happened yet, then the earlier start time.
 * `graceMinutes` caps how far away a non-running class may be (null = no cap).
 */
export function pickNearestSlot<T extends SchedulableSlot>(
  slots: T[],
  time: string,
  graceMinutes: number | null = null,
): ScoredSlot<T> | null {
  let best: ScoredSlot<T> | null = null;
  for (const slot of slots) {
    const { position, distance } = slotProximity(slot, time);
    if (position !== 'now' && graceMinutes != null && distance > graceMinutes) continue;
    const candidate = { ...slot, position, distance };
    if (!best || isCloser(candidate, best)) best = candidate;
  }
  return best;
}

/** True when `candidate` is the better walk-in match than `current`. */
export function isCloser(
  candidate: ScoredSlot<SchedulableSlot>,
  current: ScoredSlot<SchedulableSlot>,
) {
  const rank = (position: SlotPosition) => (position === 'now' ? 0 : 1);
  if (rank(candidate.position) !== rank(current.position)) return rank(candidate.position) < rank(current.position);
  if (candidate.distance !== current.distance) return candidate.distance < current.distance;
  // Same distance: the class still to come is the one the member is waiting for.
  if (candidate.position !== current.position) return candidate.position === 'upcoming';
  return timeToMinutes(candidate.startTime) < timeToMinutes(current.startTime);
}
