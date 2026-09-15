/** Row shown in frontend confirm-preview dialog. */
export interface PreviewRow {
  label: string;
  before?: string;
  after?: string;
}

export interface PreviewResult<T = Record<string, unknown>> {
  dryRun: true;
  preview: T;
  rows?: PreviewRow[];
  warning?: string;
}

export function previewResponse<T>(
  preview: T,
  opts?: { rows?: PreviewRow[]; warning?: string },
): PreviewResult<T> {
  return { dryRun: true, preview, rows: opts?.rows, warning: opts?.warning };
}
