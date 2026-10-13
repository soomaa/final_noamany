import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PermissionEngineService } from './permission-engine.service';

export type OperationalSection = 'female' | 'male';
export type EffectiveOperationalScope = {
  all: boolean;
  branches: Map<number, Set<OperationalSection>>;
};

@Injectable()
export class OperationalScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionEngineService,
  ) {}

  async resolve(userId: number, now = new Date()): Promise<EffectiveOperationalScope> {
    if (await this.permissions.isSuperAdmin(userId)) return { all: true, branches: new Map() };

    const store = this.prisma as any;
    const [assignments, exceptions] = await Promise.all([
      store.rbac_user_operational_scopes.findMany({ where: { user_id: userId } }),
      store.rbac_user_section_exceptions.findMany({
        where: { user_id: userId, OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      }),
    ]);

    const branches = new Map<number, Set<OperationalSection>>();
    for (const row of [...assignments, ...exceptions]) {
      const sections = branches.get(row.branch_id) ?? new Set<OperationalSection>();
      sections.add(row.section as OperationalSection);
      branches.set(row.branch_id, sections);
    }
    return { all: false, branches };
  }
}
