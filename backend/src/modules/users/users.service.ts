import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { MenuNode } from '../rbac/menu.service';
import { syncEmployeeUserRole } from '../rbac/job-title-role.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

/** Human labels for users.level (faithful to legacy $fea map). */
export const LEVEL_LABELS: Record<number, string> = {
  1: 'مدير على النظام',
  2: 'موظف على النظام',
  3: 'مدير فرع-ادارة',
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
  async create(dto: CreateUserDto) {
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
      data.name = link.name;
      data.branch_id_fk = link.branch_id_fk;
      data.emp_code = link.emp_code;
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
  async update(userId: number, dto: UpdateUserDto) {
    const existing = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');

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

  /** DELETE /users/:id — faithful to User::del + User_m::delete_user. */
  async remove(userId: number) {
    const existing = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');

    // Clean up the permission grants for this user as well (legacy left orphans;
    // we keep it tidy and avoid dangling rows in the permissions junction).
    await this.prisma.$transaction([
      this.prisma.permissions.deleteMany({ where: { user_id: userId } }),
      this.prisma.rbac_user_exceptions.deleteMany({ where: { user_id: userId } }),
      this.prisma.rbac_user_roles.deleteMany({ where: { user_id: userId } }),
      this.prisma.users.delete({ where: { user_id: userId } }),
    ]);
    return { userId };
  }

  /**
   * PATCH /users/:id/approved — faithful to User::status_user_type +
   * User_m::update_status_user_type, which TOGGLES approved (1 -> 0, 0 -> 1).
   */
  async toggleApproved(userId: number) {
    const existing = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { approved: true },
    });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');

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
      select: { user_id: true, username: true, name: true, level: true, emp_code: true, branch_id_fk: true },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const [tree, perms] = await Promise.all([
      this.buildPagesTree(),
      this.prisma.permissions.findMany({
        where: { user_id: userId },
        select: { page_id_fk: true },
      }),
    ]);

    const employee = user.emp_code != null
      ? await this.prisma.employees.findUnique({ where: { id: user.emp_code }, select: { branch_id_fk: true, emp_type: true } })
      : null;
    const gender = employee?.emp_type === 1 ? 'male' : employee?.emp_type === 2 ? 'female' : null;
    return {
      userId: user.user_id,
      username: user.username ?? undefined,
      fullName: user.name ?? undefined,
      tree,
      permissions: perms.map((p) => String(p.page_id_fk)),
      scope: {
        branchId: employee?.branch_id_fk ?? user.branch_id_fk ?? null,
        gender,
        editable: user.level !== 1 && user.emp_code != null,
      },
    };
  }

  async putPermissions(userId: number, body: { permissions?: string[]; scope?: { branchId?: number; gender?: 'male' | 'female' } }) {
    const user = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const pageIds = [...new Set((body.permissions ?? []).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)))];

    let scope: { branchId: number; gender: 'male' | 'female' } | null = null;
    if (body.scope != null) {
      if (user.level === 1 || user.emp_code == null) {
        throw new BadRequestException('لا يمكن تحديد نطاق الفرع/القسم لهذا المستخدم');
      }
      const branchId = Number(body.scope.branchId);
      const gender = body.scope.gender;
      if (!Number.isInteger(branchId) || branchId <= 0 || (gender !== 'male' && gender !== 'female')) {
        throw new BadRequestException('حدد فرعًا وقسمًا صالحين للمستخدم');
      }
      const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: branchId }, select: { branch_id: true } });
      if (!branch) throw new BadRequestException('الفرع المحدد غير موجود');
      scope = { branchId, gender };
    }
    const scopeUserWrite = scope
      ? this.prisma.users.update({ where: { user_id: userId }, data: { branch_id_fk: scope.branchId } })
      : null;
    const employeeScopeWrite = scope
      ? this.prisma.employees.update({ where: { id: user.emp_code! }, data: { branch_id_fk: scope.branchId, emp_type: scope.gender === 'male' ? 1 : 2 } })
      : null;
    await this.prisma.$transaction([
      this.prisma.permissions.deleteMany({ where: { user_id: userId } }),
      ...(pageIds.length ? [this.prisma.permissions.createMany({ data: pageIds.map((page_id_fk) => ({ user_id: userId, page_id_fk, page_level: 0 })) })] : []),
      ...(scopeUserWrite ? [scopeUserWrite] : []),
      ...(employeeScopeWrite ? [employeeScopeWrite] : []),
    ]);
    return { userId, count: pageIds.length, scope };
  }
}
