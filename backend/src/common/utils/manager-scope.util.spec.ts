import { JwtUser } from '../types/jwt-user';
import { assertManagerMayModify, clampManagerDays, managerKind, managerPeriodBounds, managerSection } from './manager-scope.util';
import { branchManagerCells, defaultPermissionCellsForJobTitle, isBranchManagerSheetTitle } from '../../modules/rbac/job-title-defaults';

const user = (job_title: string, extra: Partial<JwtUser> = {}): JwtUser => ({
  sub: 9, level: 2, emp_code: 9, branch: 3, branch_name: null, man_women_type: 3, name: null, image: null,
  job_title, is_trainer: false, trainer_id: null, ...extra,
});

describe('manager scope (client sheet, 22 Nov)', () => {
  it('detects branch managers and section supervisors by job title, never admins', () => {
    expect(managerKind(user('مدير فرع'))).toBe('branch');
    expect(managerKind(user('مديرة فرع'))).toBe('branch');
    expect(managerKind(user('مشرف إدارة حريمي'))).toBe('section');
    expect(managerKind(user('مشرفة ادارة رجالي'))).toBe('section');
    expect(managerKind(user('ريسيبشن'))).toBeNull();
    expect(managerKind(user('مدير فرع', { level: 1 }))).toBeNull();
  });

  it('section: title first, then emp_type, then مديرة/مدير', () => {
    expect(managerSection(user('مشرف إدارة حريمي'))).toBe('female');
    expect(managerSection(user('مشرف إدارة رجالي'))).toBe('male');
    expect(managerSection(user('مدير فرع', { man_women_type: 2 }))).toBe('female');
    expect(managerSection(user('مديرة فرع'))).toBe('female');
    expect(managerSection(user('مدير فرع'))).toBe('male');
  });

  it('periods', () => {
    const now = new Date('2026-01-15T10:00:00Z');
    expect(managerPeriodBounds('twoMonths', now)).toEqual({ from: '2025-12-01', to: '2026-01-15' });
    expect(managerPeriodBounds('month', now)).toEqual({ from: '2026-01-01', to: '2026-01-15' });
    expect(managerPeriodBounds('year', now)).toEqual({ from: '2026-01-01', to: '2026-01-15' });
    expect(managerPeriodBounds('today', now)).toEqual({ from: '2026-01-15', to: '2026-01-15' });
  });

  it('clamps a manager request into the window and leaves others alone', () => {
    const b = managerPeriodBounds('twoMonths');
    expect(clampManagerDays(user('مدير فرع'), 'twoMonths', '2020-01-01', '2099-01-01')).toEqual({ from: b.from, to: b.to, clamped: true });
    expect(clampManagerDays(user('مدير فرع'), 'twoMonths')).toEqual({ from: b.from, to: b.to, clamped: true });
    expect(clampManagerDays(user('محاسب'), 'twoMonths', '2020-01-01', '2020-02-01')).toEqual({ from: '2020-01-01', to: '2020-02-01', clamped: false });
  });

  it('managers cannot edit or delete', () => {
    expect(() => assertManagerMayModify(user('مديرة فرع'))).toThrow();
    expect(() => assertManagerMayModify(user('محاسب'))).not.toThrow();
  });

  it('job titles get the sheet as starter permissions, view/print/export only', () => {
    expect(isBranchManagerSheetTitle('مديرة فرع')).toBe(true);
    expect(isBranchManagerSheetTitle('مشرف إدارة حريمي')).toBe(true);
    expect(isBranchManagerSheetTitle('مدير عام')).toBe(false);
    expect(defaultPermissionCellsForJobTitle('مدير فرع')).toEqual(branchManagerCells());
    expect(branchManagerCells().every((c) => ['view', 'print', 'export'].includes(c.actionKey))).toBe(true);
  });
});
