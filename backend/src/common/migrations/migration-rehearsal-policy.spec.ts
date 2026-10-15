import {
  assertDisposableDatabaseName,
  buildTargetDatabaseUrl,
  generateDisposableDatabaseName,
  redactRehearsalError,
} from './migration-rehearsal-policy';

describe('migration rehearsal safety policy', () => {
  it('generates an exact disposable database name from eight random bytes', () => {
    expect(
      generateDisposableDatabaseName(() => Buffer.from('0011223344556677', 'hex')),
    ).toBe('one80_hr_e2e_0011223344556677');
  });

  it.each([
    'one80_hr',
    'one80_hr_e2e',
    'one80_hr_e2e_001122334455667',
    'one80_hr_e2e_00112233445566778',
    'ONE80_hr_e2e_0011223344556677',
    'one80_hr_e2e_00112233445566zz',
  ])('refuses cleanup for non-generated database name %s', (name) => {
    expect(() => assertDisposableDatabaseName(name)).toThrow(
      'refusing non-disposable database name',
    );
  });

  it('accepts only an exact generated database name for cleanup', () => {
    expect(assertDisposableDatabaseName('one80_hr_e2e_0011223344556677')).toBe(
      'one80_hr_e2e_0011223344556677',
    );
  });

  it('builds a loopback MySQL target URL without changing credentials or query options', () => {
    const target = buildTargetDatabaseUrl(
      'mysql://admin:secret@127.0.0.1:3306/one80_hr?connection_limit=5',
      'one80_hr_e2e_0011223344556677',
    );
    const parsed = new URL(target);

    expect(parsed.pathname).toBe('/one80_hr_e2e_0011223344556677');
    expect(parsed.username).toBe('admin');
    expect(parsed.password).toBe('secret');
    expect(parsed.searchParams.get('connection_limit')).toBe('5');
  });

  it('refuses a remote admin database URL', () => {
    expect(() =>
      buildTargetDatabaseUrl(
        'mysql://admin:secret@db.internal:3306/one80_hr',
        'one80_hr_e2e_0011223344556677',
      ),
    ).toThrow('migration rehearsal requires a loopback MySQL host');
  });

  it('redacts datasource credentials and database names from errors', () => {
    const redacted = redactRehearsalError(
      'failed mysql://admin:secret@localhost:3306/one80_hr_e2e_0011223344556677?x=1',
    );

    expect(redacted).toBe('failed [REDACTED_DATABASE_URL]');
    expect(redacted).not.toContain('admin');
    expect(redacted).not.toContain('secret');
    expect(redacted).not.toContain('one80_hr_e2e');
  });
});
