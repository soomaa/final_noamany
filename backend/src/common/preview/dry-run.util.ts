import { PreviewResult } from './preview.types';

type DryRunInput = boolean | string | number | undefined | null;

/** Parse ?dryRun=true|1 from query or body flag. */
export function isDryRun(value: DryRunInput): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
}

/** If dryRun, return preview without executing commitFn. */
export async function withDryRun<TPreview, TCommit>(
  dryRun: DryRunInput,
  buildPreview: () => Promise<TPreview> | TPreview,
  commitFn: () => Promise<TCommit> | TCommit,
): Promise<PreviewResult<TPreview> | TCommit> {
  if (isDryRun(dryRun)) {
    const preview = await buildPreview();
    return { dryRun: true, preview };
  }
  return commitFn();
}
