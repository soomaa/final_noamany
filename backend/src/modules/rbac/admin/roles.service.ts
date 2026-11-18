import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { flattenCatalog, permKey } from '../catalog/rbac.catalog';
import { ensureRoleForJobTitle, isJobTitleRoleKey, JOB_TITLE_ROLE_PREFIX } from '../job-title-role.util';
import { PermissionEngineService } from '../engine/permission-engine.service';
import { effectiveForRole, StoredCell } from '../engine/permission-resolver';
import { RbacAuditService } from './audit.service';
import { CloneRoleDto, CreateRoleDto, SaveMatrixDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RbacRolesService {
  /** Valid `resourceKey:actionKey` cells (from the catalog) — guards against junk writes. */
  private readonly validCells = new Set(
    flattenCatalog().flatMap((r) => r.actions.map((a) => permKey(r.key, a))),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PermissionEngineService,
    private readonly audit: RbacAuditService,
  ) {}

  // ---- list / CRUD --------------------------------------------------------------------

  async list() {
    // Reading the permissions screen must not replace employee role assignments.
    // Job-title provisioning belongs to explicit job/employee changes, not GET.
    const [allRoles, counts, jobs, employeesPerJob] = await Promise.all([
      this.prisma.rbac_roles.findMany({ orderBy: [{ id: 'asc' }] }),
      this.prisma.rbac_user_roles.groupBy({ by: ['role_id'], _count: { _all: true } }),
      this.prisma.department_jobs.findMany({ select: { id: true } }),
      this.prisma.employees.groupBy({
        by: ['mosma_wazefy_code'],
        where: { mosma_wazefy_code: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const roles = allRoles.filter((r) => isJobTitleRoleKey(r.key));
    const userCount = new Map(counts.map((c) => [c.role_id, c._count._all]));
    const jobIds = new Set(jobs.map((j) => j.id));
    const employeeCount = new Map(employeesPerJob.map((e) => [e.mosma_wazefy_code, e._count._all]));
    return {
      totalSlots: this.engine.getAllKeys().size,
      roles: roles.map((r) => {
        const jobTitleId = jobTitleIdOf(r.key);
        return {
          id: r.id,
          key: r.key,
          nameAr: r.name_ar,
          nameEn: r.name_en,
          description: r.description,
          isSystem: isProtectedSystemRole(r),
          isSuperAdmin: r.is_super_admin,
          users: userCount.get(r.id) ?? 0,
          jobTitleId,
          jobTitleExists: jobTitleId != null && jobIds.has(jobTitleId),
          employees: jobTitleId != null ? employeeCount.get(jobTitleId) ?? 0 : 0,
        };
      }),
    };
  }

  async create(dto: CreateRoleDto, actorUserId?: number) {
    throw new BadRequestException(
      'الأدوار تُدار من المسميات الوظيفية — أضف مسمى وظيفي جديد من إعدادات النظام ← المسميات الوظيفية',
    );
  }

  async update(id: number, _dto: UpdateRoleDto, _actorUserId?: number) {
    throw new BadRequestException('يمكن تعديل اسم الدور من صفحة المسميات الوظيفية فقط');
  }

  async clone(id: number, dto: CloneRoleDto, actorUserId?: number) {
    throw new BadRequestException('لا يمكن نسخ الأدوار — كل مسمى وظيفي له دور واحد مرتبط به');
  }

  /**
   * Delete a role that nobody uses. A job-title role is deleted together with its job title
   * (each job title owns exactly one role), and only when no user account has the role and no
   * employee (active or stopped) holds that job title.
   */
  async remove(id: number, actorUserId?: number) {
    const role = await this.getRoleOrThrow(id);
    if (role.is_super_admin) throw new BadRequestException('لا يمكن حذف دور المدير العام');
    if (isProtectedSystemRole(role)) throw new BadRequestException('لا يمكن حذف دور نظامي');
    const users = await this.prisma.rbac_user_roles.count({ where: { role_id: id } });
    if (users > 0) {
      throw new BadRequestException(`لا يمكن حذف الدور — عليه ${users} مستخدم. انقلهم لدور تاني الأول.`);
    }
    const jobTitleId = jobTitleIdOf(role.key);
    const job = jobTitleId != null
      ? await this.prisma.department_jobs.findUnique({ where: { id: jobTitleId }, select: { id: true, name: true } })
      : null;
    if (jobTitleId != null) {
      const employees = await this.prisma.employees.count({ where: { mosma_wazefy_code: jobTitleId } });
      if (employees > 0) {
        throw new BadRequestException(
          `لا يمكن حذف الدور — ${employees} موظف على المسمى الوظيفي «${job?.name ?? role.name_ar}». غيّر مسماهم الأول.`,
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rbac_roles.delete({ where: { id } });
      if (job) await tx.department_jobs.delete({ where: { id: job.id } });
    });
    await this.engine.invalidateRole(id);
    await this.audit.log({
      actorUserId,
      action: 'role.delete',
      targetType: 'role',
      targetId: id,
      detail: { key: role.key, name: role.name_ar, jobTitleId: job?.id ?? null, jobTitleName: job?.name ?? null },
    });
    return { id, jobTitleId: job?.id ?? null };
  }

  /**
   * Delete every job-title role whose job title no longer exists («المسمى الوظيفي محذوف»).
   * A role that still has user accounts is kept (deleting it would strip their permissions) and
   * reported back so the admin can move those users first.
   */
  async removeOrphans(actorUserId?: number) {
    const [roles, jobs, counts] = await Promise.all([
      this.prisma.rbac_roles.findMany({ where: { key: { startsWith: JOB_TITLE_ROLE_PREFIX } } }),
      this.prisma.department_jobs.findMany({ select: { id: true } }),
      this.prisma.rbac_user_roles.groupBy({ by: ['role_id'], _count: { _all: true } }),
    ]);
    const jobIds = new Set(jobs.map((j) => j.id));
    const userCount = new Map(counts.map((c) => [c.role_id, c._count._all]));
    const orphans = roles.filter((r) => {
      const jobId = jobTitleIdOf(r.key);
      return !r.is_super_admin && (jobId == null || !jobIds.has(jobId));
    });
    const deleted: Array<{ id: number; name: string }> = [];
    const kept: Array<{ id: number; name: string; users: number }> = [];
    for (const role of orphans) {
      const users = userCount.get(role.id) ?? 0;
      if (users > 0) {
        kept.push({ id: role.id, name: role.name_ar, users });
        continue;
      }
      await this.prisma.rbac_roles.delete({ where: { id: role.id } });
      await this.engine.invalidateRole(role.id);
      await this.audit.log({
        actorUserId,
        action: 'role.delete',
        targetType: 'role',
        targetId: role.id,
        detail: { key: role.key, name: role.name_ar, jobTitleId: null, jobTitleName: null, reason: 'orphan-cleanup' },
      });
      deleted.push({ id: role.id, name: role.name_ar });
    }
    return { deleted, kept };
  }

  async users(id: number) {
    await this.getRoleOrThrow(id);
    const links = await this.prisma.rbac_user_roles.findMany({
      where: { role_id: id },
      select: { user_id: true, expires_at: true },
    });
    const ids = links.map((l) => l.user_id);
    const users = ids.length
      ? await this.prisma.users.findMany({
          where: { user_id: { in: ids } },
          select: { user_id: true, username: true, name: true },
        })
      : [];
    const expiry = new Map(links.map((l) => [l.user_id, l.expires_at]));
    return users.map((u) => ({
      userId: u.user_id,
      username: u.username,
      name: u.name,
      expiresAt: expiry.get(u.user_id) ?? null,
    }));
  }

  // ---- matrix -------------------------------------------------------------------------

  async getMatrix(id: number) {
    const role = await this.getRoleOrThrow(id);
    const usersCount = await this.prisma.rbac_user_roles.count({ where: { role_id: id } });

    if (role.is_super_admin) {
      return {
        role: this.roleMeta(role),
        superAdmin: true,
        cells: [],
        stats: { granted: this.engine.getAllKeys().size, notGranted: 0, users: usersCount },
      };
    }

    const cells = await this.loadRoleCells(id);
    const states = this.engine.resolveCellStates(cells);
    const granted = states.filter((s) => s.effective === 'allow').length;
    return {
      role: this.roleMeta(role),
      superAdmin: false,
      cells: states,
      stats: { granted, notGranted: states.length - granted, users: usersCount },
    };
  }

  async saveMatrix(id: number, dto: SaveMatrixDto, actorUserId: number) {
    const role = await this.getRoleOrThrow(id);
    if (role.is_super_admin) throw new BadRequestException('دور المدير العام يتجاوز كل الصلاحيات ولا يحتاج مصفوفة');

    // Reject changes that target a non-existent / non-applicable cell.
    for (const c of dto.changes) {
      if (!this.validCells.has(permKey(c.resourceKey, c.actionKey))) {
        throw new BadRequestException(`خلية غير صالحة: ${c.resourceKey}:${c.actionKey}`);
      }
    }

    // Anti-escalation: the editor cannot grant a permission they do not effectively hold.
    const current = await this.loadRoleCells(id);
    const proposed = this.applyChanges(current, dto.changes);
    const input = this.engine.getResolveInput();
    const before = effectiveForRole(current, input);
    const after = effectiveForRole(proposed, input);
    const newlyGranted = [...after].filter((k) => !before.has(k));

    const editor = await this.engine.getEffective(actorUserId);
    if (!editor.superAdmin) {
      const escalations = newlyGranted.filter((k) => !editor.keys.has(k));
      if (escalations.length) {
        throw new ForbiddenException(
          `لا يمكنك منح صلاحيات لا تملكها: ${escalations.slice(0, 5).join(', ')}${escalations.length > 5 ? ' …' : ''}`,
        );
      }
    }

    // Persist the diff.
    const maps = await this.engine.getCatalogMaps();
    const ops = dto.changes.map((c) => {
      const resource_id = maps.resourceKeyToId.get(c.resourceKey)!;
      const action_id = maps.actionKeyToId.get(c.actionKey)!;
      if (c.state === 'inherit') {
        return this.prisma.rbac_role_permissions.deleteMany({ where: { role_id: id, resource_id, action_id } });
      }
      return this.prisma.rbac_role_permissions.upsert({
        where: { role_id_resource_id_action_id: { role_id: id, resource_id, action_id } },
        update: { effect: c.state },
        create: { role_id: id, resource_id, action_id, effect: c.state },
      });
    });
    await this.prisma.$transaction(ops);

    await this.audit.log({
      actorUserId,
      action: 'role.matrix.update',
      targetType: 'role',
      targetId: id,
      detail: { changes: dto.changes.length, granted: newlyGranted.length },
    });
    await this.engine.invalidateRole(id);

    return this.getMatrix(id);
  }

  // ---- helpers ------------------------------------------------------------------------

  private roleMeta(r: { id: number; key: string; name_ar: string; name_en: string | null; description: string | null; is_system: boolean; is_super_admin: boolean }) {
    return {
      id: r.id,
      key: r.key,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      description: r.description,
      isSystem: r.is_system,
      isSuperAdmin: r.is_super_admin,
    };
  }

  private async getRoleOrThrow(id: number) {
    const role = await this.prisma.rbac_roles.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    return role;
  }

  /** Load a role's stored cells as key-space StoredCell[]. */
  private async loadRoleCells(roleId: number): Promise<StoredCell[]> {
    const [rows, maps] = await Promise.all([
      this.prisma.rbac_role_permissions.findMany({
        where: { role_id: roleId },
        select: { resource_id: true, action_id: true, effect: true },
      }),
      this.engine.getCatalogMaps(),
    ]);
    return rows
      .map((r) => ({
        resourceKey: maps.resourceIdToKey.get(r.resource_id)!,
        actionKey: maps.actionIdToKey.get(r.action_id)!,
        effect: r.effect as 'allow' | 'deny',
      }))
      .filter((c) => c.resourceKey && c.actionKey);
  }

  /** Apply tri-state changes to a cell list, returning the resulting stored cells. */
  private applyChanges(current: StoredCell[], changes: SaveMatrixDto['changes']): StoredCell[] {
    const map = new Map(current.map((c) => [permKey(c.resourceKey, c.actionKey), c]));
    for (const c of changes) {
      const k = permKey(c.resourceKey, c.actionKey);
      if (c.state === 'inherit') map.delete(k);
      else map.set(k, { resourceKey: c.resourceKey, actionKey: c.actionKey, effect: c.state });
    }
    return [...map.values()];
  }

  private async uniqueKey(seed: string): Promise<string> {
    const base =
      seed
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || `role_${Date.now()}`;
    let key = base;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await this.prisma.rbac_roles.findUnique({ where: { key }, select: { id: true } })) {
      key = `${base}_${++n}`.slice(0, 60);
      if (n > 50) throw new ConflictException('تعذّر توليد مفتاح فريد للدور');
    }
    return key;
  }
}

/** The job-title id inside a `job_title_<id>` role key, or null for other roles. */
/**
 * Roles the system owns and nobody may delete. Job-title roles are stored with is_system = true
 * only because they are created automatically with their job title; they are deletable like any
 * unused role (the job title goes with them).
 */
function isProtectedSystemRole(role: { key: string; is_system: boolean }): boolean {
  return role.is_system && !isJobTitleRoleKey(role.key);
}

function jobTitleIdOf(key: string): number | null {
  if (!isJobTitleRoleKey(key)) return null;
  const id = Number(key.slice(JOB_TITLE_ROLE_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}
