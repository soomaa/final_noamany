import 'reflect-metadata';
import { EmployeesModule } from '../employees/employees.module';
import { ClubMembersModule } from './club-members.module';

describe('ClubMembersModule dependency wiring', () => {
  it('imports EmployeesModule for ClubLeadsService', () => {
    const imports = Reflect.getMetadata('imports', ClubMembersModule) as unknown[];
    expect(imports).toContain(EmployeesModule);
  });
});
