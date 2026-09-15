/** index -1 requests the final row of the preceding page. A removed selection keeps its former slot. */
export function adjacentClient(ids: number[], selectedId: number | undefined, anchor: number, page: number, pages: number, direction: -1 | 1): { page: number; index: number } | null {
  const found = ids.indexOf(selectedId ?? -1);
  const index = found >= 0 ? found + direction : anchor + (direction === 1 ? 0 : -1);
  if (index < 0) return page > 1 ? { page: page - 1, index: -1 } : null;
  if (index >= ids.length) return page < pages ? { page: page + 1, index: 0 } : null;
  return { page, index };
}
export function swipeDirection(dx: number, dy: number, dir: string): -1 | 1 | null {
  if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return (dx > 0 ? 1 : -1) * (dir === 'rtl' ? 1 : -1) as -1 | 1;
}
