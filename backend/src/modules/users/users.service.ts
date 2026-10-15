import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveRoleIdForJobTitleId, syncEmployeeUserRole } from '../rbac/job-title-role.util';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** bcrypt cost — matches the auth module's default rounds. */
const BCRYPT_ROUNDS = 12;

export interface MenuNode {
  id: number;
  title: string;
  link: string;
  icon: string;
  order: number;
  bgColor: string | null;
  color: string | null;
  children: MenuNode[];
}

const USER_PUBLIC_FIELDS = {
  user_id: true,
  username: true,
  name: true,
  email: true,
  level: true,
  role_id_fk: true,
  image: true,
  branch_id_fk: true,
  emp_code: true,
  approved: true,
} as const;

/** Human labels for users.level (faithful to legacy $fea map). */
export const LEVEL_LABELS: Record<number, string> = {
  1: 'مدير على النظام',
  2: 'موظف على النظام',
  3: 'مدير فرع-ادارة',
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionEngine: PermissionEngineService,
  ) {}

  async findAll() {
    const rows = await this.prisma.users.findMany({
      // Show every real staff login: admins, employee-linked accounts, and any
      // account that carries an assigned role (a provisioned staff user whose
      // emp_code was never set would otherwise vanish from the list). Retired
      // orphan logins (renamed `_retired_*` on phone change) stay hidden.
      where: {
        OR: [
          { level: 1 },
          { emp_code: { not: null } },
          { role_id_fk: { not: null } },
        ],
        NOT: { username: { startsWith: '_retired_' } },
      },
      select: USER_PUBLIC_FIELDS,
      orderBy: { user_id: 'desc' },
    });
    return rows.map((u) => ({ ...u, level_label: LEVEL_LABELS[u.level ?? 0] ?? '' }));
  }

  findByUsername(username: string) {
    return this.prisma.users.findFirst({ where: { username } });
  }

  /**
   * Parameterized uniqueness check on users.username (legacy used a raw SQL
   * callback `SELECT * FROM users WHERE username = '$x' AND user_id != '$id'`,
   * which was SQL-injectable — this replaces it with a safe Prisma query).
   */
  private async assertUsernameUnique(username: string, excludeUserId?: number) {
    const clash = await this.prisma.users.findFirst({
      where: {
        username,
        ...(excludeUserId != null ? { user_id: { not: excludeUserId } } : {}),
      },
      select: { user_id: true },
    });
    if (clash) throw new ConflictException('اسم المستخدم مسجل من قبل');
  }

  /**
   * Resolve the employee linkage for level 2/3 users. Legacy User_m::add/edit
   * looked up the employee BY emp_code and stored: name = employee.employee,
   * branch_id_fk = employee.branch_id_fk, and users.emp_code = employee.id.
   */
  private async resolveEmployeeLink(empCode: number) {
    const emp = await this.prisma.employees.findFirst({
      where: { emp_code: empCode },
      select: { id: true, employee: true, branch_id_fk: true, mosma_wazefy_code: true },
    });
    if (!emp) throw new BadRequestException('الموظف غير موجود');
    return {
      name: emp.employee ?? null,
      branch_id_fk: emp.branch_id_fk ?? null,
      emp_code: emp.id, // legacy stores the employee row id into users.emp_code
      job_title_id: emp.mosma_wazefy_code,
    };
  }

  /** POST /users — faithful to User::adduser + User_m::add. */
  async create(dto: CreateUserDto, actorUserId: number) {
    if (dto.level === 1) throw new ForbiddenException('استخدم زر Add Admin لتأكيد كلمة مرور حسابك');
    if (dto.level === 1) await this.assertSystemAdmin(actorUserId);
    await this.assertUsernameUnique(dto.username);

    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const data: Record<string, unknown> = {
      username: dto.username,
      approved: 1, // legacy hard-codes approved = 1 on add
      password,
      email: dto.email ?? null,
      image: dto.image ?? null,
      level: dto.level,
    };

    if (dto.level === 1) {
      data.name = dto.fullname ?? null;
    } else {
      const link = await this.resolveEmployeeLink(dto.empCode!);
      await this.assertEmployeeLinkAvailable(link.emp_code);
      if (!link.job_title_id) throw new BadRequestException('المسمى الوظيفي مطلوب لربط صلاحيات المستخدم');
      const roleId = await resolveRoleIdForJobTitleId(this.prisma, link.job_title_id);
      await this.assertCanAssignRole(actorUserId, undefined, roleId, true);
      data.name = link.name;
      data.branch_id_fk = link.branch_id_fk;
      data.emp_code = link.emp_code;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      // The legacy schema has no UNIQUE index on username/emp_code. Lock one
      // stable InnoDB row and repeat both checks inside the transaction so two
      // concurrent creates cannot link the same employee or username.
      await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 ORDER BY user_id LIMIT 1 FOR UPDATE`;
      const usernameClash = await tx.users.findFirst({
        where: { username: dto.username },
        select: { user_id: true },
      });
      if (usernameClash) throw new ConflictException('اسم المستخدم مسجل من قبل');
      if (data.emp_code != null) {
        const employeeClash = await tx.users.findFirst({
          where: { emp_code: data.emp_code as number },
          select: { user_id: true },
        });
        if (employeeClash) throw new ConflictException('الموظف مرتبط بحساب نظام بالفعل');
      }
      let created = await tx.users.create({ data: data as never, select: USER_PUBLIC_FIELDS });
      if (created.level !== 1 && created.emp_code != null) {
        await syncEmployeeUserRole(tx, created.emp_code);
        created = await tx.users.findUniqueOrThrow({
          where: { user_id: created.user_id },
          select: USER_PUBLIC_FIELDS,
        });
      }
      return created;
    });
    this.permissionEngine.invalidateUser(user.user_id);
    return { ...user, level_label: LEVEL_LABELS[user.level ?? 0] ?? '' };
  }

  /** PATCH /users/:id — faithful to User::edit + User_m::edit. */
  async update(userId: number, dto: UpdateUserDto, actorUserId: number) {
    const existing = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    if (dto.level === 1 && existing.level !== 1) throw new ForbiddenException('استخدم زر Add Admin لتأكيد كلمة مرور حسابك');
    if (dto.level === 1 || existing.level === 1) await this.assertSystemAdmin(actorUserId);
    const demotingSystemAdmin = existing.level === 1 && dto.level !== 1;

    await this.assertUsernameUnique(dto.username, userId);

    const data: Record<string, unknown> = {
      username: dto.username,
      approved: 1, // legacy re-sets approved = 1 on edit
      email: dto.email ?? null,
      level: dto.level,
    };

    if (dto.level === 1) {
      data.name = dto.fullname ?? null;
    } else {
      const link = await this.resolveEmployeeLink(dto.empCode!);
      await this.assertEmployeeLinkAvailable(link.emp_code, userId);
      if (!link.job_title_id) throw new BadRequestException('المسمى الوظيفي مطلوب لربط صلاحيات المستخدم');
      const roleId = await resolveRoleIdForJobTitleId(this.prisma, link.job_title_id);
      const assigned = await this.prisma.rbac_user_roles.count({
        where: { user_id: userId, role_id: roleId },
      });
      const assignmentChanges = existing.emp_code !== link.emp_code
        || existing.role_id_fk !== roleId
        || assigned === 0;
      await this.assertCanAssignRole(actorUserId, userId, roleId, assignmentChanges);
      data.name = link.name;
      data.branch_id_fk = link.branch_id_fk;
      data.emp_code = link.emp_code;
    }

    // Password only updated when provided (legacy: `if (!empty($post['password']))`).
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      // Drop legacy plaintext / mirror columns so they cannot leak an old secret.
      data.app_pass = null;
      data.user_pass = null;
      data.x_y_z = null;
    }

    // Image only overwritten when a new file is supplied (legacy: `if image != null`).
    if (dto.image != null && dto.image !== '') {
      data.image = dto.image;
    }

    const superRoleIds = demotingSystemAdmin
      ? (await this.prisma.rbac_roles.findMany({
        where: { is_super_admin: true },
        select: { id: true },
      })).map((role) => role.id)
      : [];
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 ORDER BY user_id LIMIT 1 FOR UPDATE`;
      const usernameClash = await tx.users.findFirst({
        where: { username: dto.username, user_id: { not: userId } },
        select: { user_id: true },
      });
      if (usernameClash) throw new ConflictException('اسم المستخدم مسجل من قبل');
      if (data.emp_code != null) {
        const employeeClash = await tx.users.findFirst({
          where: { emp_code: data.emp_code as number, user_id: { not: userId } },
          select: { user_id: true },
        });
        if (employeeClash) throw new ConflictException('الموظف مرتبط بحساب نظام بالفعل');
      }
      if (demotingSystemAdmin) {
        await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 FOR UPDATE`;
        const admins = await tx.users.count({ where: { level: 1 } });
        if (admins <= 1) throw new BadRequestException('لا يمكن سحب صلاحية آخر مدير عام في النظام');
      }
      let updated = await tx.users.update({
          where: { user_id: userId },
          data: data as never,
          select: USER_PUBLIC_FIELDS,
        });
        if (demotingSystemAdmin) {
          await tx.rbac_user_roles.deleteMany({
            where: { user_id: userId, role_id: { in: superRoleIds } },
          });
        }
        if (updated.level !== 1 && updated.emp_code != null) {
          await syncEmployeeUserRole(tx, updated.emp_code);
          updated = await tx.users.findUniqueOrThrow({
            where: { user_id: userId },
            select: USER_PUBLIC_FIELDS,
          });
        }
      return updated;
    });
    this.permissionEngine.invalidateUser(userId);
    return { ...user, level_label: LEVEL_LABELS[user.level ?? 0] ?? '' };
  }

  /** DELETE /users/:id — faithful to User::del + User_m::delete_user. */
  async remove(userId: number, actorUserId: number) {
    if (userId === actorUserId) throw new ForbiddenException('لا يمكنك حذف حسابك بنفسك');
    const existing = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    if (existing.level === 1) {
      await this.assertSystemAdmin(actorUserId);
    }

    // Clean up the permission grants for this user as well (legacy left orphans;
    // we keep it tidy and avoid dangling rows in the permissions junction).
    await this.prisma.$transaction(async (tx) => {
      if (existing.level === 1) {
        await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 FOR UPDATE`;
        const admins = await tx.users.count({ where: { level: 1 } });
        if (admins <= 1) throw new BadRequestException('لا يمكن حذف آخر مدير عام في النظام');
      }
      await tx.permissions.deleteMany({ where: { user_id: userId } });
      await tx.rbac_user_exceptions.deleteMany({ where: { user_id: userId } });
      await tx.rbac_user_roles.deleteMany({ where: { user_id: userId } });
      await tx.users.delete({ where: { user_id: userId } });
    });
    this.permissionEngine.invalidateUser(userId);
    return { userId };
  }

  /**
   * PATCH /users/:id/approved — faithful to User::status_user_type +
   * User_m::update_status_user_type, which TOGGLES approved (1 -> 0, 0 -> 1).
   */
  async toggleApproved(userId: number, actorUserId: number) {
    if (userId === actorUserId) throw new ForbiddenException('لا يمكنك إيقاف حسابك بنفسك');
    const existing = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { approved: true, level: true },
    });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    if (existing.level === 1) await this.assertSystemAdmin(actorUserId);

    const next = existing.approved === 1 ? 0 : 1;
    await this.prisma.users.update({ where: { user_id: userId }, data: { approved: next } });
    this.permissionEngine.invalidateUser(userId);
    return { userId, approved: next };
  }

  /** Full pages tree for the permissions editor (legacy get_categories / sub_categories). */
  private async buildPagesTree(): Promise<MenuNode[]> {
    const pages = await this.prisma.pages.findMany({ orderBy: { page_order: 'asc' } });
    const byParent = new Map<number, typeof pages>();
    for (const pg of pages) {
      const arr = byParent.get(pg.group_id_fk) ?? [];
      arr.push(pg);
      byParent.set(pg.group_id_fk, arr);
    }

    const build = (pg: (typeof pages)[number]): MenuNode | null => {
      if (!pg.page_title || !pg.page_link || !pg.page_icon_code) return null;
      const children = (byParent.get(pg.page_id) ?? [])
        .map(build)
        .filter((n): n is MenuNode => n !== null);
      return {
        id: pg.page_id,
        title: pg.page_title,
        link: pg.page_link,
        icon: pg.page_icon_code,
        order: pg.page_order,
        bgColor: pg.bg_color ?? null,
        color: pg.color ?? null,
        children,
      };
    };

    return pages
      .filter((p) => p.group_id_fk === 0 || p.level === 1)
      .map(build)
      .filter((n): n is MenuNode => n !== null);
  }

  async getPermissions(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { user_id: true, username: true, name: true },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const [tree, perms] = await Promise.all([
      this.buildPagesTree(),
      this.prisma.permissions.findMany({
        where: { user_id: userId },
        select: { page_id_fk: true },
      }),
    ]);

    return {
      userId: user.user_id,
      username: user.username ?? undefined,
      fullName: user.name ?? undefined,
      tree,
      permissions: perms.map((p) => String(p.page_id_fk)),
    };
  }

  async putPermissions(userId: number, body: { permissions?: string[] }, actorUserId: number) {
    if (userId === actorUserId) throw new ForbiddenException('لا يمكنك تعديل صلاحيات حسابك بنفسك');
    const user = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const pageIds = [...new Set((body.permissions ?? []).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)))];

    await this.prisma.$transaction([
      this.prisma.permissions.deleteMany({ where: { user_id: userId } }),
      ...(pageIds.length
        ? [
            this.prisma.permissions.createMany({
              data: pageIds.map((page_id_fk) => ({ user_id: userId, page_id_fk, page_level: 0 })),
            }),
          ]
        : []),
    ]);

    return { userId, count: pageIds.length };
  }

  private async assertSystemAdmin(actorUserId: number) {
    const actor = await this.prisma.users.findUnique({
      where: { user_id: actorUserId },
      select: { level: true },
    });
    if (actor?.level !== 1) throw new ForbiddenException('هذا الإجراء متاح للمدير العام فقط');
  }

  private async assertEmployeeLinkAvailable(employeeId: number, excludeUserId?: number) {
    const linked = await this.prisma.users.findFirst({
      where: {
        emp_code: employeeId,
        ...(excludeUserId != null ? { user_id: { not: excludeUserId } } : {}),
      },
      select: { user_id: true },
    });
    if (linked) throw new ConflictException('الموظف مرتبط بالفعل بحساب نظام آخر');
  }

  private async assertCanAssignRole(
    actorUserId: number,
    targetUserId: number | undefined,
    roleId: number,
    assignmentChanges: boolean,
  ) {
    if (targetUserId === actorUserId && assignmentChanges) {
      throw new ForbiddenException('لا يمكنك تغيير ربط الموظف بما يعدل صلاحيات حسابك بنفسك');
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
      throw new ForbiddenException('لا يمكنك ربط مستخدم بمسمى يمنح صلاحيات لا تملكها');
    }
  }
}
