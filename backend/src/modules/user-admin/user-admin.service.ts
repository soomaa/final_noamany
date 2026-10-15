import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveRoleIdForJobTitleId, syncEmployeeUserRole } from '../rbac/job-title-role.util';
import { legacyRoleKeyForLevel } from '../rbac/legacy-level-roles';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { StaffSessionService } from '../auth/staff-session.service';
import { BusinessAuditService } from '../../common/audit/business-audit.service';
import {
  CreateSystemUserDto,
  UpdateSystemUserDto,
  UpdateUserStatusDto,
} from './dto/user-admin.dto';

/** Columns safe to return — never expose password / mirror secret columns. */
const USER_PUBLIC_SELECT = {
  user_id: true,
  username: true,
  name: true,
  email: true,
  level: true,
  branch_id_fk: true,
  emp_code: true,
  approved: true,
  image: true,
} as const;

@Injectable()
export class UserAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly permissionEngine: PermissionEngineService,
    private readonly staffSessions: StaffSessionService,
    private readonly audit: BusinessAuditService,
  ) {}

  private get bcryptRounds(): number {
    return this.config.get<number>('bcryptRounds') ?? 12;
  }

  /**
   * POST /users — faithful to User::adduser / User_m::add.
   * Hashes the password with bcrypt, hard-codes approved = 1, and guards a
   * duplicate username (legacy is_unique[users.username]).
   */
  async create(dto: CreateSystemUserDto, actorUserId: number) {
    if (dto.level === 1) throw new ForbiddenException('استخدم زر Add Admin لتأكيد كلمة مرور حسابك');
    if (dto.level === 1) await this.assertSystemAdmin(actorUserId);
    if (dto.empCode != null) {
      const linked = await this.prisma.users.findFirst({
        where: { emp_code: dto.empCode },
        select: { user_id: true },
      });
      if (linked) throw new ConflictException('الموظف مرتبط بحساب نظام بالفعل');
    }
    const targetRoleId = await this.resolveTargetRoleId(dto.level, dto.empCode ?? null);
    if (targetRoleId != null) {
      await this.assertCanAssignRole(actorUserId, undefined, targetRoleId, true);
    }
    await this.assertUsernameUnique(dto.username);

    const password = await bcrypt.hash(dto.password, this.bcryptRounds);
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 ORDER BY user_id LIMIT 1 FOR UPDATE`;
      const usernameClash = await tx.users.findFirst({
        where: { username: dto.username },
        select: { user_id: true },
      });
      if (usernameClash) throw new ConflictException('اسم المستخدم مسجل من قبل');
      if (dto.empCode != null) {
        const employeeClash = await tx.users.findFirst({
          where: { emp_code: dto.empCode },
          select: { user_id: true },
        });
        if (employeeClash) throw new ConflictException('الموظف مرتبط بحساب نظام بالفعل');
      }
      let created = await tx.users.create({ data: {
        username: dto.username,
        name: dto.name,
        email: dto.email ?? null,
        password,
        level: dto.level,
        branch_id_fk: dto.branchId ?? null,
        emp_code: dto.empCode ?? null,
        approved: 1, // legacy hard-codes approved = 1 on add
      }, select: USER_PUBLIC_SELECT });
      if (created.level !== 1 && created.emp_code != null) {
        await syncEmployeeUserRole(tx, created.emp_code);
        created = await tx.users.findUniqueOrThrow({
          where: { user_id: created.user_id },
          select: USER_PUBLIC_SELECT,
        });
      }
      await this.audit.log({
        entityType: 'system_user',
        entityId: created.user_id,
        action: 'system_user.created',
        actorUserId,
        branchId: created.branch_id_fk ?? undefined,
        after: created,
      }, tx);
      return created;
    });
    this.permissionEngine.invalidateUser(user.user_id);
    return user;
  }

  /**
   * PATCH /users/:id — faithful to User::edit / User_m::edit.
   * Password is only rehashed when a non-empty value is supplied.
   */
  async update(userId: number, dto: UpdateSystemUserDto, actorUserId: number) {
    const existing = await this.findOrThrow(userId);
    if (dto.level === 1 && existing.level !== 1) throw new ForbiddenException('استخدم زر Add Admin لتأكيد كلمة مرور حسابك');
    if (dto.level === 1 || existing.level === 1) await this.assertSystemAdmin(actorUserId);
    const nextLevel = dto.level ?? existing.level ?? 2;
    const demotingSystemAdmin = existing.level === 1 && nextLevel !== 1;
    const targetRoleId = await this.resolveTargetRoleId(nextLevel, existing.emp_code ?? null);
    if (targetRoleId != null) {
      const assigned = existing.emp_code != null
        ? await this.prisma.rbac_user_roles.count({ where: { user_id: userId, role_id: targetRoleId } })
        : 0;
      const assignmentChanges = nextLevel !== existing.level
        || (existing.emp_code != null && (existing.role_id_fk !== targetRoleId || assigned === 0));
      await this.assertCanAssignRole(actorUserId, userId, targetRoleId, assignmentChanges);
    }

    const data: {
      name?: string;
      email?: string | null;
      level?: number;
      branch_id_fk?: number;
      password?: string;
      app_pass?: null;
      user_pass?: null;
    } = {};

    if (dto.name != null) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email ?? null;
    if (dto.level != null) data.level = dto.level;
    if (dto.branchId != null) data.branch_id_fk = dto.branchId;
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, this.bcryptRounds);
      // Drop legacy plaintext / mirror columns so an old secret cannot leak.
      data.app_pass = null;
      data.user_pass = null;
    }

    const superRoleIds = demotingSystemAdmin
      ? (await this.prisma.rbac_roles.findMany({
        where: { is_super_admin: true },
        select: { id: true },
      })).map((role) => role.id)
      : [];
    const user = await this.prisma.$transaction(async (tx) => {
      if (demotingSystemAdmin) {
        await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 FOR UPDATE`;
        const admins = await tx.users.count({ where: { level: 1 } });
        if (admins <= 1) throw new BadRequestException('لا يمكن سحب صلاحية آخر مدير عام في النظام');
      }
      let updated = await tx.users.update({ where: { user_id: userId }, data, select: USER_PUBLIC_SELECT });
        if (demotingSystemAdmin) {
          await tx.rbac_user_roles.deleteMany({ where: { user_id: userId, role_id: { in: superRoleIds } } });
        }
        if (updated.level !== 1 && updated.emp_code != null) {
          await syncEmployeeUserRole(tx, updated.emp_code);
          updated = await tx.users.findUniqueOrThrow({
            where: { user_id: userId },
            select: USER_PUBLIC_SELECT,
          });
        }
      if (dto.password) {
        await this.staffSessions.revokeAllForUser(userId, 'password_changed_by_admin', tx);
      }
      await this.audit.log({
        entityType: 'system_user',
        entityId: userId,
        action: 'system_user.updated',
        actorUserId,
        branchId: updated.branch_id_fk ?? undefined,
        before: existing,
        after: updated,
      }, tx);
      return updated;
    });
    this.permissionEngine.invalidateUser(userId);
    return user;
  }

  /** DELETE /users/:id — faithful to User::del / User_m::delete_user. */
  async remove(userId: number, actorUserId: number) {
    if (userId === actorUserId) throw new ForbiddenException('لا يمكنك حذف حسابك بنفسك');
    const existing = await this.findOrThrow(userId);
    if (existing.level === 1) {
      await this.assertSystemAdmin(actorUserId);
    }
    // Clean up the permission grants too, to avoid dangling junction rows.
    await this.prisma.$transaction(async (tx) => {
      if (existing.level === 1) {
        await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 FOR UPDATE`;
        const admins = await tx.users.count({ where: { level: 1 } });
        if (admins <= 1) throw new BadRequestException('لا يمكن حذف آخر مدير عام في النظام');
      }
      await tx.permissions.deleteMany({ where: { user_id: userId } });
      await tx.rbac_user_exceptions.deleteMany({ where: { user_id: userId } });
      await tx.rbac_user_roles.deleteMany({ where: { user_id: userId } });
      await this.staffSessions.revokeAllForUser(userId, 'user_deleted', tx);
      await this.audit.log({
        entityType: 'system_user',
        entityId: userId,
        action: 'system_user.deleted',
        actorUserId,
        branchId: existing.branch_id_fk ?? undefined,
        before: existing,
      }, tx);
      await tx.users.delete({ where: { user_id: userId } });
    });
    this.permissionEngine.invalidateUser(userId);
    return { userId };
  }

  /** PATCH /users/:id/status — faithful to User::status_user_type (approved 0|1). */
  async updateStatus(userId: number, dto: UpdateUserStatusDto, actorUserId: number) {
    if (userId === actorUserId) throw new ForbiddenException('لا يمكنك إيقاف حسابك بنفسك');
    const existing = await this.findOrThrow(userId);
    if (existing.level === 1) await this.assertSystemAdmin(actorUserId);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.users.update({
        where: { user_id: userId },
        data: { approved: dto.approved },
        select: USER_PUBLIC_SELECT,
      });
      if (dto.approved === 0) {
        await this.staffSessions.revokeAllForUser(userId, 'user_suspended', tx);
      }
      await this.audit.log({
        entityType: 'system_user',
        entityId: userId,
        action: dto.approved === 1 ? 'system_user.activated' : 'system_user.suspended',
        actorUserId,
        branchId: updated.branch_id_fk ?? undefined,
        before: { approved: existing.approved },
        after: { approved: updated.approved },
      }, tx);
      return updated;
    });
    this.permissionEngine.invalidateUser(userId);
    return user;
  }

  async revokeSessions(userId: number, reason: string, actorUserId: number) {
    const existing = await this.findOrThrow(userId);
    const normalizedReason = reason.trim();
    await this.prisma.$transaction(async (tx) => {
      await this.staffSessions.revokeAllForUser(userId, `emergency:${normalizedReason}`.slice(0, 100), tx);
      await this.audit.log({
        entityType: 'staff_session',
        entityId: userId,
        action: 'staff_session.emergency_revoked',
        actorUserId,
        branchId: existing.branch_id_fk ?? undefined,
        reason: normalizedReason,
        after: { userId, revoked: true },
      }, tx);
    });
    return { userId, revoked: true };
  }

  private async assertUsernameUnique(username: string, excludeUserId?: number) {
    const clash = await this.prisma.users.findFirst({
      where: {
        username,
        ...(excludeUserId != null ? { user_id: { not: excludeUserId } } : {}),
      },
      select: { user_id: true },
    });
    if (clash) throw new ConflictException('اسم المستخدم مستخدم');
  }

  private async findOrThrow(userId: number) {
    const row = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!row) throw new NotFoundException('المستخدم غير موجود');
    return row;
  }

  private async assertSystemAdmin(actorUserId: number) {
    const actor = await this.prisma.users.findUnique({
      where: { user_id: actorUserId },
      select: { level: true },
    });
    if (actor?.level !== 1) throw new ForbiddenException('هذا الإجراء متاح للمدير العام فقط');
  }

  private async resolveTargetRoleId(level: number, employeeId: number | null): Promise<number | undefined> {
    if (level === 1) return undefined;
    if (employeeId != null) {
      const employee = await this.prisma.employees.findUnique({
        where: { id: employeeId },
        select: { mosma_wazefy_code: true },
      });
      if (!employee) throw new BadRequestException('الموظف المرتبط بالحساب غير موجود');
      if (!employee.mosma_wazefy_code) {
        throw new BadRequestException('المسمى الوظيفي مطلوب لربط صلاحيات المستخدم');
      }
      return resolveRoleIdForJobTitleId(this.prisma, employee.mosma_wazefy_code);
    }
    const fallback = await this.prisma.rbac_roles.findUnique({
      where: { key: legacyRoleKeyForLevel(level) },
      select: { id: true },
    });
    return fallback?.id;
  }

  private async assertCanAssignRole(
    actorUserId: number,
    targetUserId: number | undefined,
    roleId: number,
    assignmentChanges: boolean,
  ) {
    if (targetUserId === actorUserId && assignmentChanges) {
      throw new ForbiddenException('لا يمكنك تعديل حسابك بما يغير صلاحياته');
    }
    if (!assignmentChanges) return;
    const [actor, role] = await Promise.all([
      this.permissionEngine.getEffective(actorUserId),
      this.permissionEngine.effectiveForRoleIds([roleId]),
    ]);
    if (role.superAdmin && !actor.superAdmin) {
      throw new ForbiddenException('إسناد دور المدير العام متاح للمدير العام فقط');
    }
    if (!actor.superAdmin && [...role.keys].some((key) => !actor.keys.has(key))) {
      throw new ForbiddenException('لا يمكنك إنشاء أو تعديل حساب بصلاحيات لا تملكها');
    }
  }
}
