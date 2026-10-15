import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateAppUserDto,
  ListAppUsersDto,
  UpdateAppUserDto,
} from './dto/app-users.dto';

/** Public view of a mobile-app user — NEVER exposes user_pass / rand_key. */
export interface AppUserView {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: number;
  image: string | null;
}

@Injectable()
export class AppUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Legacy User.php app_users list: search name/phone/email, filter by status. */
  async list(q: ListAppUsersDto) {
    const and: Prisma.api_usersWhereInput[] = [];

    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { user_name: { contains: s } },
          { user_phone: { contains: s } },
          { user_email: { contains: s } },
        ],
      });
    }

    if (q.status === '0' || q.status === '1') {
      and.push({ status: Number(q.status) });
    }

    const where: Prisma.api_usersWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.api_users.findMany({
        where,
        orderBy: { user_id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.api_users.count({ where }),
    ]);

    return paginated(rows.map((r) => this.toView(r)), total, q.page, q.pageSize);
  }

  async get(id: number) {
    const row = await this.findOrThrow(id);
    return this.toView(row);
  }

  async create(dto: CreateAppUserDto) {
    // The phone/email is the app login — block duplicates so two accounts can't share one.
    const clashes = await this.prisma.api_users.findFirst({
      where: {
        OR: [
          ...(dto.phone ? [{ user_phone: dto.phone }] : []),
          ...(dto.email ? [{ user_email: dto.email }] : []),
        ],
      },
      select: { user_id: true, user_phone: true, user_email: true },
    });
    if (clashes) {
      const same = clashes.user_phone === dto.phone ? 'رقم الجوال' : 'البريد الإلكتروني';
      throw new BadRequestException(`${same} مُستخدم بالفعل لحساب آخر`);
    }
    const user_pass = await this.hash(dto.password);
    const row = await this.prisma.api_users.create({
      data: {
        user_name: dto.name,
        user_phone: dto.phone,
        user_email: dto.email,
        user_city: dto.city ?? null,
        user_pass,
        status: 0, // legacy: new app users start inactive
      },
    });
    return this.toView(row);
  }

  async update(id: number, dto: UpdateAppUserDto) {
    await this.findOrThrow(id);
    const row = await this.prisma.api_users.update({
      where: { user_id: id },
      data: {
        ...(dto.name != null ? { user_name: dto.name } : {}),
        ...(dto.phone != null ? { user_phone: dto.phone } : {}),
        ...(dto.email != null ? { user_email: dto.email } : {}),
        ...(dto.city != null ? { user_city: dto.city } : {}),
        // only re-hash when a non-empty password is supplied
        ...(dto.password?.trim()
          ? { user_pass: await this.hash(dto.password) }
          : {}),
      },
    });
    return this.toView(row);
  }

  /** PATCH /:id/status — activate (1) / deactivate (0). */
  async setStatus(id: number, status: number) {
    await this.findOrThrow(id);
    const row = await this.prisma.api_users.update({
      where: { user_id: id },
      data: { status },
    });
    return this.toView(row);
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.api_users.delete({ where: { user_id: id } });
    return { id };
  }

  private async hash(password: string): Promise<string> {
    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    return bcrypt.hash(password, rounds);
  }

  private toView(row: {
    user_id: number;
    user_name: string | null;
    user_phone: string | null;
    user_email: string | null;
    user_city: string | null;
    status: number;
    m_image: string | null;
  }): AppUserView {
    return {
      id: row.user_id,
      name: row.user_name,
      phone: row.user_phone,
      email: row.user_email,
      city: row.user_city,
      status: row.status,
      image: row.m_image,
    };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.api_users.findUnique({ where: { user_id: id } });
    if (!row) throw new NotFoundException('المستخدم غير موجود');
    return row;
  }
}
