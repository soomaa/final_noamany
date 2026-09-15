/** Quote a CSV cell and neutralize spreadsheet formulas, including hidden prefixes. */
export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRows(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
