import { effectiveForRole, resolveMatrix, type ResolveInput } from './permission-resolver';

describe('permission resolver revocation', () => {
  const input: ResolveInput = {
    resourceActions: new Map([
      ['club', ['view']],
      ['club.members', ['view']],
    ]),
    ancestry: new Map([
      ['club', null],
      ['club.members', 'club'],
    ]),
  };

  it('removes an inherited page grant when the page gets an explicit deny', () => {
    const keys = effectiveForRole(
      [
        { resourceKey: 'club', actionKey: 'view', effect: 'allow' },
        { resourceKey: 'club.members', actionKey: 'view', effect: 'deny' },
      ],
      input,
    );

    expect(keys.has('club:view')).toBe(true);
    expect(keys.has('club.members:view')).toBe(false);
  });

  it('reports the page deny as explicit rather than inherited', () => {
    const page = resolveMatrix(
      [
        { resourceKey: 'club', actionKey: 'view', effect: 'allow' },
        { resourceKey: 'club.members', actionKey: 'view', effect: 'deny' },
      ],
      input,
    ).find((cell) => cell.resourceKey === 'club.members');

    expect(page).toMatchObject({ explicit: 'deny', effective: 'deny', inheritedFrom: null });
  });
});
