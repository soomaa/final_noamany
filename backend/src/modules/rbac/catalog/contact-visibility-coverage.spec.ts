import { RESOURCE_TREE, type ResourceNode } from './rbac.catalog';
import {
  DESK_REVEAL_PERMISSIONS,
  PHONE_PERMISSIONS,
  REVEAL_PHONE_PERMISSIONS,
} from '../../../common/privacy/contact-visibility.service';
import { branchManagerCells, receptionCells, salesCells } from '../job-title-defaults';

function flatten(nodes: ResourceNode[]): ResourceNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
}

const byKey = new Map(flatten(RESOURCE_TREE).map((n) => [n.key, n]));

/**
 * Every screen whose phone numbers are masked must also offer the actions that unmask them.
 * Masking a screen without them hides the number from everyone permanently — there is no cell
 * left in the permissions matrix to grant (ported from Gymora / FIT90).
 */
const MASKED_SCREENS = ['club.reception', 'club.members', 'club.subscriptions.list', 'club.leads', 'sales.portal', 'club.calls'];

describe('contact-visibility coverage', () => {
  it.each(MASKED_SCREENS)('%s can be granted viewPhone and revealPhone', (key) => {
    expect(byKey.get(key)?.actions).toEqual(expect.arrayContaining(['viewPhone', 'revealPhone']));
  });

  it('the service checks only permission keys the catalog actually offers', () => {
    for (const perm of [...PHONE_PERMISSIONS, ...REVEAL_PHONE_PERMISSIONS, ...DESK_REVEAL_PERMISSIONS]) {
      const [resource, action] = perm.split(':');
      expect(byKey.get(resource!)?.actions).toContain(action);
    }
  });

  it('checks the grant on every masked screen', () => {
    expect(PHONE_PERMISSIONS.map((perm) => perm.split(':')[0]).sort()).toEqual([...MASKED_SCREENS].sort());
  });

  it('defaults: reception gets the eye, branch managers see numbers, sales only own records', () => {
    const has = (cells: { resourceKey: string; actionKey: string }[], key: string) =>
      cells.some((c) => `${c.resourceKey}:${c.actionKey}` === key);
    expect(has(receptionCells(), 'club.reception:revealPhone')).toBe(true);
    expect(receptionCells().some((c) => c.actionKey === 'viewPhone')).toBe(false);
    expect(has(branchManagerCells(), 'club.members:viewPhone')).toBe(true);
    expect(salesCells().some((c) => c.actionKey === 'viewPhone' || c.actionKey === 'revealPhone')).toBe(false);
  });
});
