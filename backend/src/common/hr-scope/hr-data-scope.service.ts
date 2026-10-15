import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionEngineService } from '../../modules/rbac/engine/permission-engine.service';
import { BranchScopeService } from '../branch-scope/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../types/jwt-user';

export type HrScopeLevel = 'own' | 'team' | 'branch' | 'department' | 'global';

@Injectable()
export class HrDataScopeService {
  constructor(
    private readonly permissions: PermissionEngineService,
    private readonly branches: BranchScopeService,
    private readonly prisma: PrismaService,
  ) {}

  async employeeWhere(
    user: JwtUser,
    resourceKey = 'employees.list',
  ): Promise<Prisma.employeesWhereInput> {
    if (user.level === 1) return {};
    const configured = await this.permissions.scopeFor(user.sub, resourceKey);
    const scope = (configured ?? (user.level === 2 ? 'own' : 'branch')) as HrScopeLevel;

    if (scope === 'global') return {};
    if (scope === 'own') return this.selfWhere(user);
    if (scope === 'department') {
      if (user.employeeId == null) return { id: -1 };
      const employee = await this.prisma.employees.findUnique({
        where: { id: user.employeeId },
        select: { edara_id: true },
      });
      return employee?.edara_id != null ? { edara_id: employee.edara_id } : { id: -1 };
    }

    const branchWhere = this.branchWhere(user);
    if (scope === 'branch') return branchWhere;
    if (scope === 'team') {
      if (user.employeeId == null) return { id: -1 };
      const team: Prisma.employeesWhereInput = {
        OR: [
          { id: user.employeeId },
          { manger: String(user.employeeId) },
          ...(user.employeeCode != null ? [{ manger: String(user.employeeCode) }] : []),
        ],
      };
      return { AND: [branchWhere, team] };
    }
    return { id: -1 };
  }

  async requestWhere(
    user: JwtUser,
    resourceKey = 'leaves.requests',
  ): Promise<Prisma.hr_requestsWhereInput> {
    const identities = await this.scopedEmployeeIdentities(user, resourceKey);
    if (identities === null) return {};
    if (!identities.ids.length && !identities.codes.length) return { id: -1 };
    return {
      OR: [
        ...(identities.ids.length ? [{ emp_id_fk: { in: identities.ids } }] : []),
        ...(identities.codes.length ? [{ emp_code_fk: { in: identities.codes } }] : []),
      ],
    };
  }

  async legacyRequestWhere(
    user: JwtUser,
    resourceKey = 'leaves.requests',
  ): Promise<Prisma.hr_talabat_ordersWhereInput> {
    const identities = await this.scopedEmployeeIdentities(user, resourceKey);
    if (identities === null) return {};
    return identities.ids.length
      ? { emp_id_fk: { in: identities.ids } }
      : { id: -1 };
  }

  /** Canonical ids/codes for legacy HR tables that do not expose Prisma relations. */
  async employeeIdentities(
    user: JwtUser,
    resourceKey: string,
  ): Promise<{ ids: number[]; codes: number[] } | null> {
    return this.scopedEmployeeIdentities(user, resourceKey);
  }

  /**
   * Fail closed when an employee-scoped record points outside the actor's resolved scope.
   * NotFound deliberately avoids confirming that an out-of-scope employee exists.
   */
  async assertEmployeeInScope(
    user: JwtUser,
    employeeId: number,
    resourceKey: string,
  ): Promise<void> {
    const scoped = await this.employeeWhere(user, resourceKey);
    const visible = await this.prisma.employees.count({
      where: { AND: [scoped, { id: employeeId }] },
    });
    if (visible !== 1) throw new NotFoundException('السجل غير موجود');
  }

  private async scopedEmployeeIdentities(
    user: JwtUser,
    resourceKey: string,
  ): Promise<{ ids: number[]; codes: number[] } | null> {
    const where = await this.employeeWhere(user, resourceKey);
    if (Object.keys(where).length === 0) return null;
    const rows = await this.prisma.employees.findMany({
      where,
      select: { id: true, emp_code: true },
    });
    return {
      ids: rows.map((row) => row.id),
      codes: rows
        .map((row) => row.emp_code)
        .filter((code): code is number => code != null),
    };
  }

  private selfWhere(user: JwtUser): Prisma.employeesWhereInput {
    return user.employeeId != null ? { id: user.employeeId } : { id: -1 };
  }

  private branchWhere(user: JwtUser): Prisma.employeesWhereInput {
    const branchIds = this.branches.allowedBranchIds(user);
    if (branchIds === null) return {};
    return branchIds.length ? { branch_id_fk: { in: branchIds } } : { id: -1 };
  }
}
