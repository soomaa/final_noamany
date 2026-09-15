/** Encode a CSV cell while preventing spreadsheet formula execution. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function toCsvWithBom(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return `\uFEFF${toCsv(rows)}`;
}
