import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { syncEmployeeUserRole } from '../rbac/job-title-role.util';
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
  ) {}

  private get bcryptRounds(): number {
    return this.config.get<number>('bcryptRounds') ?? 12;
  }

  /**
   * POST /users — faithful to User::adduser / User_m::add.
   * Hashes the password with bcrypt, hard-codes approved = 1, and guards a
   * duplicate username (legacy is_unique[users.username]).
   */
  async create(dto: CreateSystemUserDto) {
    await this.assertUsernameUnique(dto.username);

    const password = await bcrypt.hash(dto.password, this.bcryptRounds);
    let user = await this.prisma.users.create({
      data: {
        username: dto.username,
        name: dto.name,
        email: dto.email ?? null,
        password,
        level: dto.level,
        branch_id_fk: dto.branchId ?? null,
        emp_code: dto.empCode ?? null,
        approved: 1, // legacy hard-codes approved = 1 on add
      },
      select: USER_PUBLIC_SELECT,
    });
    if (user.level !== 1 && user.emp_code != null) {
      await syncEmployeeUserRole(this.prisma, user.emp_code);
      user = await this.prisma.users.findUniqueOrThrow({
        where: { user_id: user.user_id },
        select: USER_PUBLIC_SELECT,
      });
    }
    return user;
  }

  /**
   * PATCH /users/:id — faithful to User::edit / User_m::edit.
   * Password is only rehashed when a non-empty value is supplied.
   */
  async update(userId: number, dto: UpdateSystemUserDto) {
    await this.findOrThrow(userId);

    const data: {
      name?: string;
      email?: string | null;
      level?: number;
      branch_id_fk?: number;
      password?: string;
      app_pass?: null;
      pass_demo?: null;
      user_pass?: null;
      x_y_z?: null;
    } = {};

    if (dto.name != null) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email ?? null;
    if (dto.level != null) data.level = dto.level;
    if (dto.branchId != null) data.branch_id_fk = dto.branchId;
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, this.bcryptRounds);
      // Drop legacy plaintext / mirror columns so an old secret cannot leak.
      data.app_pass = null;
      data.pass_demo = null;
      data.user_pass = null;
      data.x_y_z = null;
    }

    let user = await this.prisma.users.update({
      where: { user_id: userId },
      data,
      select: USER_PUBLIC_SELECT,
    });
    if (user.level !== 1 && user.emp_code != null) {
      await syncEmployeeUserRole(this.prisma, user.emp_code);
      user = await this.prisma.users.findUniqueOrThrow({
        where: { user_id: userId },
        select: USER_PUBLIC_SELECT,
      });
    }
    return user;
  }

  /** DELETE /users/:id — faithful to User::del / User_m::delete_user. */
  async remove(userId: number) {
    await this.findOrThrow(userId);
    // Clean up the permission grants too, to avoid dangling junction rows.
    await this.prisma.$transaction([
      this.prisma.permissions.deleteMany({ where: { user_id: userId } }),
      this.prisma.rbac_user_exceptions.deleteMany({ where: { user_id: userId } }),
      this.prisma.rbac_user_roles.deleteMany({ where: { user_id: userId } }),
      this.prisma.users.delete({ where: { user_id: userId } }),
    ]);
    return { userId };
  }

  /** PATCH /users/:id/status — faithful to User::status_user_type (approved 0|1). */
  async updateStatus(userId: number, dto: UpdateUserStatusDto) {
    await this.findOrThrow(userId);
    const user = await this.prisma.users.update({
      where: { user_id: userId },
      data: { approved: dto.approved },
      select: USER_PUBLIC_SELECT,
    });
    return user;
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
}
