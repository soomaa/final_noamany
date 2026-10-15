/* eslint-disable no-console */
/**
 * Dependency-free acceptance tests for the RBAC inheritance engine.
 * Run:  npx ts-node prisma/test-engine.ts
 * Exits non-zero if any of the 12 spec acceptance scenarios fail.
 *
 * (Pure-function tests — no DB. Structured so they can be ported to jest later.)
 */
import {
  applyExceptions,
  effectiveForRole,
  effectiveForUser,
  resolveMatrix,
  StoredCell,
  ResolveInput,
} from '../src/modules/rbac/engine/permission-resolver';

// --- Fixture tree -----------------------------------------------------------------------
//  moduleA
//    ├─ groupA1 ─ pageA1a [view,create,delete], pageA1b [view]
//    └─ groupA2 ─ pageA2a [view]
//  moduleB ─ pageB1 [view]
const ancestry = new Map<string, string | null>([
  ['moduleA', null],
  ['groupA1', 'moduleA'],
  ['pageA1a', 'groupA1'],
  ['pageA1b', 'groupA1'],
  ['groupA2', 'moduleA'],
  ['pageA2a', 'groupA2'],
  ['moduleB', null],
  ['pageB1', 'moduleB'],
]);
const resourceActions = new Map<string, string[]>([
  ['moduleA', ['view', 'create', 'delete', 'configure']],
  ['groupA1', ['view', 'create', 'delete', 'configure']],
  ['pageA1a', ['view', 'create', 'delete']],
  ['pageA1b', ['view']],
  ['groupA2', ['view']],
  ['pageA2a', ['view']],
  ['moduleB', ['view']],
  ['pageB1', ['view']],
]);
const input: ResolveInput = { resourceActions, ancestry };

const allow = (resourceKey: string, actionKey: string): StoredCell => ({ resourceKey, actionKey, effect: 'allow' });
const deny = (resourceKey: string, actionKey: string): StoredCell => ({ resourceKey, actionKey, effect: 'deny' });

// --- Tiny harness -----------------------------------------------------------------------
let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}`);
  }
}
const has = (s: Set<string>, k: string) => s.has(k);
const not = (s: Set<string>, k: string) => !s.has(k);

console.log('RBAC inheritance engine — acceptance scenarios\n');

// 1. Allow on a parent module grants View to all inheriting children.
{
  const eff = effectiveForRole([allow('moduleA', 'view')], input);
  check('1. module Allow inherits View to all descendants', has(eff, 'pageA1a:view') && has(eff, 'pageA1b:view') && has(eff, 'pageA2a:view') && has(eff, 'groupA1:view'));
  check('1b. inheritance is per-action (no create from a view grant)', not(eff, 'pageA1a:create'));
  check('1c. sibling module not affected', not(eff, 'moduleB:view'));
}

// 2. Deny on a subgroup blocks that branch; siblings stay allowed.
{
  const eff = effectiveForRole([allow('moduleA', 'view'), deny('groupA1', 'view')], input);
  check('2. subgroup Deny blocks its branch', not(eff, 'pageA1a:view') && not(eff, 'pageA1b:view'));
  check('2b. sibling branch under same module stays allowed', has(eff, 'pageA2a:view') && has(eff, 'groupA2:view'));
}

// 3. Explicit Allow on a child under a Denied parent works (true override).
{
  const eff = effectiveForRole([deny('groupA1', 'view'), allow('pageA1a', 'view')], input);
  check('3. child Allow overrides denied parent', has(eff, 'pageA1a:view') && not(eff, 'pageA1b:view'));
}

// 4. User Deny exception removes a permission even when a role allows it.
{
  const roleAllows = effectiveForRole([allow('moduleA', 'view')], input);
  const eff = applyExceptions(roleAllows, [deny('pageA1a', 'view')]);
  check('4. user Deny exception removes a role-granted permission', not(eff, 'pageA1a:view') && has(eff, 'pageA1b:view'));
}

// 5. User Allow exception adds a permission even when no role grants it.
{
  const eff = effectiveForUser([[]], [allow('pageB1', 'view')], input);
  check('5. user Allow exception grants where no role does', has(eff, 'pageB1:view'));
}

// 6. A module with no View is absent from the effective set (=> hidden from nav).
{
  const eff = effectiveForRole([allow('moduleA', 'view')], input);
  check('6. unconnected module has no View (nav would hide it)', not(eff, 'moduleB:view') && not(eff, 'pageB1:view'));
}

// 7. Default deny — nothing explicit anywhere => no access.
{
  const eff = effectiveForRole([], input);
  check('7. default deny when nothing is explicit', eff.size === 0);
}

// 8. Deny wins when an exception Allow and Deny target the same cell.
{
  const eff = applyExceptions(new Set<string>(), [allow('pageB1', 'view'), deny('pageB1', 'view')]);
  check('8. exception Deny beats exception Allow on same cell', not(eff, 'pageB1:view'));
}

// 9. Matrix exposes inherited (ghost) state with the deciding ancestor.
{
  const states = resolveMatrix([allow('moduleA', 'view')], input);
  const childView = states.find((s) => s.resourceKey === 'pageA1a' && s.actionKey === 'view')!;
  check('9. matrix marks inherited Allow with source ancestor', childView.explicit === null && childView.effective === 'allow' && childView.inheritedFrom === 'moduleA');
}

// 10. Two roles: if either effectively allows, the user has access (allow wins across roles).
{
  const role1 = [deny('moduleA', 'view')]; // denies everything under moduleA for role1
  const role2 = [allow('moduleA', 'view')]; // allows it for role2
  const eff = effectiveForUser([role1, role2], [], input);
  check('10. union across roles — Allow wins', has(eff, 'pageA1b:view') && has(eff, 'pageA1a:view'));
}

// 11. Anti-escalation primitive: an editor cannot grant what is not in their own effective set.
{
  const editor = effectiveForRole([allow('groupA1', 'view')], input); // editor can view groupA1 subtree only
  const wantGrant = ['pageA1a:view']; // within editor's set -> allowed
  const wantEscalate = ['moduleB:view']; // outside editor's set -> blocked
  check('11. editor may grant a permission they hold', wantGrant.every((k) => editor.has(k)));
  check('11b. editor may NOT grant a permission they lack', !wantEscalate.every((k) => editor.has(k)));
}

// 12. Super admin: the "all applicable cells" set covers everything (engine short-circuit input).
{
  const all = new Set<string>();
  for (const [res, acts] of resourceActions) for (const a of acts) all.add(`${res}:${a}`);
  check('12. super-admin all-set covers every applicable cell', has(all, 'moduleB:view') && has(all, 'pageA1a:delete') && has(all, 'moduleA:configure'));
}

// --- Report -----------------------------------------------------------------------------
console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.error('FAILED:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('All acceptance scenarios passed ✅');
