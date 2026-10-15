import { effectiveForRole, resolveMatrix, type ResolveInput } from './permission-resolver';

describe('permission resolver revocation', () => {
  const input: ResolveInput = {
    resourceActions: new Map([
      ['hr', ['view']],
      ['hr.employees', ['view']],
    ]),
    ancestry: new Map([
      ['hr', null],
      ['hr.employees', 'hr'],
    ]),
  };

  it('removes an inherited page grant when the page gets an explicit deny', () => {
    const keys = effectiveForRole(
      [
        { resourceKey: 'hr', actionKey: 'view', effect: 'allow' },
        { resourceKey: 'hr.employees', actionKey: 'view', effect: 'deny' },
      ],
      input,
    );

    expect(keys.has('hr:view')).toBe(true);
    expect(keys.has('hr.employees:view')).toBe(false);
  });

  it('reports the page deny as explicit rather than inherited', () => {
    const page = resolveMatrix(
      [
        { resourceKey: 'hr', actionKey: 'view', effect: 'allow' },
        { resourceKey: 'hr.employees', actionKey: 'view', effect: 'deny' },
      ],
      input,
    ).find((cell) => cell.resourceKey === 'hr.employees');

    expect(page).toMatchObject({ explicit: 'deny', effective: 'deny', inheritedFrom: null });
  });

  it('inherits special actions and lets the closest page override win', () => {
    const specialInput: ResolveInput = {
      resourceActions: new Map([
        ['hr', ['execute', 'configure']],
        ['hr.payroll', ['execute', 'configure']],
      ]),
      ancestry: new Map([
        ['hr', null],
        ['hr.payroll', 'hr'],
      ]),
    };

    const keys = effectiveForRole(
      [
        { resourceKey: 'hr', actionKey: 'execute', effect: 'allow' },
        { resourceKey: 'hr', actionKey: 'configure', effect: 'allow' },
        { resourceKey: 'hr.payroll', actionKey: 'execute', effect: 'deny' },
      ],
      specialInput,
    );

    expect(keys.has('hr.payroll:configure')).toBe(true);
    expect(keys.has('hr.payroll:execute')).toBe(false);
  });
});
