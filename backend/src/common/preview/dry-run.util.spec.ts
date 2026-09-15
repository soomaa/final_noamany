import { isDryRun, withDryRun } from './dry-run.util';

describe('dry-run.util', () => {
  it('parses dryRun flags', () => {
    expect(isDryRun(true)).toBe(true);
    expect(isDryRun('true')).toBe(true);
    expect(isDryRun('1')).toBe(true);
    expect(isDryRun(false)).toBe(false);
    expect(isDryRun(undefined)).toBe(false);
  });

  it('withDryRun returns preview without commit', async () => {
    let committed = false;
    const result = await withDryRun(
      true,
      () => ({ amount: 100 }),
      () => {
        committed = true;
        return { ok: true };
      },
    );
    expect(result).toEqual({ dryRun: true, preview: { amount: 100 } });
    expect(committed).toBe(false);
  });

  it('withDryRun commits when not dry', async () => {
    let committed = false;
    const result = await withDryRun(
      false,
      () => ({ amount: 100 }),
      () => {
        committed = true;
        return { ok: true };
      },
    );
    expect(result).toEqual({ ok: true });
    expect(committed).toBe(true);
  });
});
