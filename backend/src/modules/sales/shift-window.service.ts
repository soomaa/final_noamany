import { Injectable } from '@nestjs/common';
import { localDateString, localTimeString } from './sales.utils';

export { localDateString, localTimeString };

/** Normalize HH:MM or HH:MM:SS to HH:MM:SS for string comparison. */
export function normalizeTime(time: string): string {
  const t = time.trim();
  if (t.length === 5) return `${t}:00`;
  return t.substring(0, 8);
}

@Injectable()
export class ShiftWindowService {
  /** Whether `time` falls inside shift window [startTime, endTime] (overnight-aware). */
  isInWindow(startTime: string, endTime: string, time: string): boolean {
    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);
    const t = normalizeTime(time);

    if (start > end) {
      return t >= start || t <= end;
    }
    return t >= start && t <= end;
  }

  /** True when current local time is past the shift end (overnight-aware). */
  isPastEndTime(expectedStartTime: string, expectedEndTime: string, currentTime: string): boolean {
    const start = normalizeTime(expectedStartTime);
    const end = normalizeTime(expectedEndTime);
    const now = normalizeTime(currentTime);

    if (start > end) {
      return now > end && now < start;
    }
    return now > end;
  }

  /** Whether two shift windows overlap (overnight-aware). */
  rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    return (
      this.isInWindow(startA, endA, startB) ||
      this.isInWindow(startA, endA, endB) ||
      this.isInWindow(startB, endB, startA) ||
      this.isInWindow(startB, endB, endA)
    );
  }

  nowTime(): string {
    return localTimeString();
  }

  todayDate(): string {
    return localDateString();
  }
}
