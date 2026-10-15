import 'reflect-metadata';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { OrgController } from '../org/org.controller';
import { EmployeesController } from './employees.controller';
import { HR_SCOPE_SAFE_LOOKUP_KEY } from '../../common/hr-scope/hr-scope-safe-lookup.decorator';
import { SCOPED_HR_DATA_KEY } from '../../common/hr-scope/scoped-hr-data.decorator';

function permissionsFor(
  controller: { prototype: object },
  method: string,
): string[] {
  const handler = (controller.prototype as Record<string, object>)[method];
  return Reflect.getMetadata(REQUIRES_PERMISSION_KEY, handler) ?? [];
}

describe('employee create lookup permissions', () => {
  it('lets employee creators request the next employee code', () => {
    expect(permissionsFor(EmployeesController, 'nextCode')).toEqual(
      expect.arrayContaining([
        'employees.list:view',
        'employees.list:create',
        'employees.new:create',
      ]),
    );
  });

  it('lets employee creators read job-title options without managing them', () => {
    expect(permissionsFor(OrgController, 'jobTitles')).toEqual(
      expect.arrayContaining([
        'org.departments:view',
        'employees.list:create',
        'employees.new:create',
      ]),
    );
    expect(permissionsFor(OrgController, 'createJobTitle')).toEqual([
      'org.departments:create',
    ]);
  });

  it('declares form lookups safe and employee writes locally scoped', () => {
    expect(Reflect.getMetadata(
      HR_SCOPE_SAFE_LOOKUP_KEY,
      EmployeesController.prototype.nextCode,
    )).toBe(true);
    expect(Reflect.getMetadata(
      HR_SCOPE_SAFE_LOOKUP_KEY,
      OrgController.prototype.jobTitles,
    )).toBe(true);
    expect(Reflect.getMetadata(
      SCOPED_HR_DATA_KEY,
      EmployeesController.prototype.create,
    )).toBe(true);
    expect(Reflect.getMetadata(
      SCOPED_HR_DATA_KEY,
      EmployeesController.prototype.update,
    )).toBe(true);
  });
});
