import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import type { MenuNode } from '../rbac/menu.service';
import { syncEmployeeUserRole } from '../rbac/job-title-role.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { assertCanGrantLevel, assertCanManageUser } from './user-target-scope.util';

/** bcrypt cost — matches the auth module's default rounds. */
const BCRYPT_ROUNDS = 12;

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

/**
 * Accounts that were deleted but could not be removed from the table (other records still
 * point at them) are renamed to this prefix: hidden everywhere, unable to log in, and their
 * old username is free for a new account.
 */
const RETIRED_PREFIX = '_retired_';

export function isRetiredUsername(username: string | null | undefined): boolean {
  return /^_retired_/i.test((username ?? '').trim());
}

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
    private readonly scope: BranchScopeService,
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
        NOT: { username: { startsWith: RETIRED_PREFIX } },
      },
      select: USER_PUBLIC_FIELDS,
      orderBy: { user_id: 'desc' },
    });
    // الصلاحية column: the user's actual roles (ادمن، مدير فرع، ريسبشن …), not the legacy level.
    const links = rows.length
      ? await this.prisma.rbac_user_roles.findMany({
          where: { user_id: { in: rows.map((u) => u.user_id) } },
          select: { user_id: true, role: { select: { name_ar: true, is_super_admin: true } } },
          orderBy: { role_id: 'asc' },
        })
      : [];
    const rolesOf = new Map<number, string[]>();
    for (const link of links) {
      const list = rolesOf.get(link.user_id) ?? [];
      // The super-admin role first, so «ادمن» leads the badge list.
      if (link.role.is_super_admin) list.unshift(link.role.name_ar.trim());
      else list.push(link.role.name_ar.trim());
      rolesOf.set(link.user_id, list);
    }
    return rows.map((u) => ({
      ...u,
      level_label: LEVEL_LABELS[u.level ?? 0] ?? '',
      roles: rolesOf.get(u.user_id) ?? (u.level === 1 ? ['ادمن'] : []),
    }));
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
      select: { id: true, employee: true, branch_id_fk: true },
    });
    if (!emp) throw new BadRequestException('الموظف غير موجود');
    return {
      name: emp.employee ?? null,
      branch_id_fk: emp.branch_id_fk ?? null,
      emp_code: emp.id, // legacy stores the employee row id into users.emp_code
    };
  }

  /** POST /users — faithful to User::adduser + User_m::add. */
  async create(dto: CreateUserDto, actor: JwtUser) {
    // Only a system admin may mint a level-1 login or one outside their branch scope.
    assertCanGrantLevel(actor, dto.level);
    const link = dto.level === 1 ? null : await this.resolveEmployeeLink(dto.empCode!);
    if (link) this.scope.assertBranchAllowed(actor, link.branch_id_fk);
    const existingEmployeeUser = link
      ? await this.prisma.users.findFirst({ where: { emp_code: link.emp_code }, select: { user_id: true } })
      : null;
    // Re-using an employee's existing login is an edit of that login.
    if (existingEmployeeUser) await assertCanManageUser(this.prisma, this.scope, actor, existingEmployeeUser.user_id);
    await this.assertUsernameUnique(dto.username, existingEmployeeUser?.user_id);

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
    } else if (link) {
      data.name = link.name;
      data.branch_id_fk = link.branch_id_fk;
      data.emp_code = link.emp_code;
    }

    if (existingEmployeeUser) {
      let user = await this.prisma.users.update({
        where: { user_id: existingEmployeeUser.user_id },
        data: data as never,
        select: USER_PUBLIC_FIELDS,
      });
      if (user.emp_code != null) {
        await syncEmployeeUserRole(this.prisma, user.emp_code);
        user = await this.prisma.users.findUniqueOrThrow({
          where: { user_id: user.user_id },
          select: USER_PUBLIC_FIELDS,
        });
      }
      return { ...user, level_label: LEVEL_LABELS[user.level ?? 0] ?? '' };
    }

    let user = await this.prisma.users.create({
      data: data as never,
      select: USER_PUBLIC_FIELDS,
    });
    if (user.level !== 1 && user.emp_code != null) {
      await syncEmployeeUserRole(this.prisma, user.emp_code);
      user = await this.prisma.users.findUniqueOrThrow({
        where: { user_id: user.user_id },
        select: USER_PUBLIC_FIELDS,
      });
    }
    return { ...user, level_label: LEVEL_LABELS[user.level ?? 0] ?? '' };
  }

  /** PATCH /users/:id — faithful to User::edit + User_m::edit. */
  async update(userId: number, dto: UpdateUserDto, actor: JwtUser) {
    const existing = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    // Non-admins cannot edit/reset an admin, a foreign-branch login, or promote to level 1.
    await assertCanManageUser(this.prisma, this.scope, actor, userId);
    assertCanGrantLevel(actor, dto.level);

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
      // Re-linking to another employee must stay inside the actor's scope too.
      this.scope.assertBranchAllowed(actor, link.branch_id_fk);
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
      data.pass_demo = null;
      data.x_y_z = null;
    }

    // Image only overwritten when a new file is supplied (legacy: `if image != null`).
    if (dto.image != null && dto.image !== '') {
      data.image = dto.image;
    }

    let user = await this.prisma.users.update({
      where: { user_id: userId },
      data: data as never,
      select: USER_PUBLIC_FIELDS,
    });
    if (user.level !== 1 && user.emp_code != null) {
      await syncEmployeeUserRole(this.prisma, user.emp_code);
      user = await this.prisma.users.findUniqueOrThrow({
        where: { user_id: userId },
        select: USER_PUBLIC_FIELDS,
      });
    }
    return { ...user, level_label: LEVEL_LABELS[user.level ?? 0] ?? '' };
  }

  /**
   * PATCH /users/:id/account — تعديل on حسابات النظام (MetaFit): username, name and an
   * optional new password. Role, employee link and status are not touched here.
   */
  async updateAccount(userId: number, dto: UpdateAccountDto, actor: JwtUser) {
    const existing = await this.prisma.users.findUnique({ where: { user_id: userId }, select: { user_id: true } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    await assertCanManageUser(this.prisma, this.scope, actor, userId);
    const username = dto.username.trim();
    if (isRetiredUsername(username)) throw new BadRequestException('اسم المستخدم غير مسموح');
    await this.assertUsernameUnique(username, userId);
    const data: Prisma.usersUpdateInput = { username, name: dto.fullname.trim() };
    if (dto.password) {
      if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException('كلمة المرور طويلة جدًا');
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      data.app_pass = null;
      data.user_pass = null;
      data.pass_demo = null;
      data.x_y_z = null;
    }
    const user = await this.prisma.users.update({ where: { user_id: userId }, data, select: USER_PUBLIC_FIELDS });
    return { ...user, level_label: LEVEL_LABELS[user.level ?? 0] ?? '' };
  }

  /**
   * DELETE /users/:id — the account is gone: not listed, cannot log in, and its username can be
   * used again right away. The row is removed; if other records still reference it (legacy
   * mappings, audit links) it is retired instead: renamed `_retired_<id>_…`, password cleared,
   * disabled. The employee file and past operations are never touched.
   */
  async remove(userId: number, actor: JwtUser) {
    if (actor?.sub === userId) throw new ForbiddenException('لا يمكنك حذف حسابك بنفسك');
    const existing = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    await assertCanManageUser(this.prisma, this.scope, actor, userId);

    // Clean up the permission grants for this user as well (legacy left orphans;
    // we keep it tidy and avoid dangling rows in the permissions junction).
    const grants = [
      this.prisma.permissions.deleteMany({ where: { user_id: userId } }),
      this.prisma.rbac_user_exceptions.deleteMany({ where: { user_id: userId } }),
      this.prisma.rbac_user_roles.deleteMany({ where: { user_id: userId } }),
    ];
    try {
      await this.prisma.$transaction([...grants, this.prisma.users.delete({ where: { user_id: userId } })]);
      return { userId, retired: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2003') throw error;
    }
    await this.prisma.$transaction([
      ...grants,
      this.prisma.users.update({
        where: { user_id: userId },
        data: {
          username: `${RETIRED_PREFIX}${userId}_${Date.now()}`.slice(0, 40),
          approved: 0,
          password: null,
          app_pass: null,
          user_pass: null,
          pass_demo: null,
          x_y_z: null,
          email: null,
          role_id_fk: null,
          device_token: '',
        },
      }),
    ]);
    return { userId, retired: true };
  }

  /**
   * PATCH /users/:id/approved — faithful to User::status_user_type +
   * User_m::update_status_user_type, which TOGGLES approved (1 -> 0, 0 -> 1).
   */
  async toggleApproved(userId: number, actor: JwtUser) {
    if (actor?.sub === userId) throw new ForbiddenException('لا يمكنك إيقاف حسابك بنفسك');
    const existing = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { approved: true },
    });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    await assertCanManageUser(this.prisma, this.scope, actor, userId);

    const next = existing.approved === 1 ? 0 : 1;
    await this.prisma.users.update({ where: { user_id: userId }, data: { approved: next } });
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

  async putPermissions(userId: number, body: { permissions?: string[] }) {
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
}
