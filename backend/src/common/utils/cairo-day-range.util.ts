const cairoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

/** UTC bounds for the Cairo calendar day, including daylight-saving transitions. */
export function cairoDayRange(now = new Date()): { gte: Date; lt: Date } {
  const date = cairoDate.format(now);
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const nextDate = new Date(midnight + 86400000).toISOString().slice(0, 10);
  const boundary = (target: string, approximate: number): Date => {
    let low = approximate - 86400000;
    let high = approximate + 86400000;
    // Find the first instant belonging to the requested local date. This also
    // handles Cairo's skipped/repeated midnight without using the host timezone.
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (cairoDate.format(new Date(mid)) < target) low = mid + 1;
      else high = mid;
    }
    return new Date(low);
  };
  return { gte: boundary(date, midnight), lt: boundary(nextDate, midnight + 86400000) };
}
