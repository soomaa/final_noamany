/** Pure layout math for the daily booking board, kept out of the JSX so it can be tested. */

export interface BoardSpan {
  startTime: string;
  endTime: string;
}

export function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Snap a pointer position inside a column to the nearest grid line. */
export function snapToSlot(minutes: number, slotMinutes: number): string {
  return fromMinutes(Math.round(minutes / slotMinutes) * slotMinutes);
}

/**
 * Side-by-side lanes for a captain double-booked at the same hour. Lanes are counted per
 * overlapping cluster, so one clash at noon does not shrink every other cell in the column.
 */
export function packLanes<T extends BoardSpan>(entries: T[]): Array<{ entry: T; lane: number; lanes: number }> {
  const sorted = [...entries].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const placed: Array<{ entry: T; lane: number; lanes: number }> = [];
  let cluster: Array<{ entry: T; lane: number; lanes: number }> = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    const lanes = cluster.reduce((max, item) => Math.max(max, item.lane + 1), 1);
    cluster.forEach((item) => { item.lanes = lanes; });
    cluster = [];
  };

  for (const entry of sorted) {
    const start = toMinutes(entry.startTime);
    const end = toMinutes(entry.endTime);
    if (start >= clusterEnd) {
      closeCluster();
      clusterEnd = end;
    } else {
      clusterEnd = Math.max(clusterEnd, end);
    }
    const taken = new Set(
      cluster.filter((item) => toMinutes(item.entry.endTime) > start).map((item) => item.lane),
    );
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    const item = { entry, lane, lanes: lane + 1 };
    cluster.push(item);
    placed.push(item);
  }
  closeCluster();
  return placed;
}
