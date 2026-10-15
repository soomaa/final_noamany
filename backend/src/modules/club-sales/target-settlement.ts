function nextDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function targetWindowAfterSettlement(start: string, end: string, latestSettledEnd: string | null) {
  const effectiveStart = latestSettledEnd && latestSettledEnd >= start ? nextDay(latestSettledEnd) : start;
  return { start: effectiveStart, end, active: effectiveStart <= end };
}
