import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isBcryptHash, legacyMatches } from '../auth/legacy-hash.util';
import { CreateAdminAccountDto } from './dto/admin-account.dto';

const PUBLIC_FIELDS = {
  user_id: true, username: true, name: true, level: true,
  emp_code: true, branch_id_fk: true, approved: true,
} as const;

@Injectable()
export class AdminAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertActor(actor: JwtUser) {
    if (!actor || actor.level !== 1) {
      throw new ForbiddenException('إضافة أدمن متاحة للأدمن فقط');
    }
  }

  private async checkedActor(actor: JwtUser, currentPassword: string) {
    this.assertActor(actor);
    const current = await this.prisma.users.findUnique({
      where: { user_id: actor.sub },
      select: { user_id: true, level: true, approved: true, password: true },
    });
    if (!current || current.level !== 1 || current.approved !== 1) {
      throw new ForbiddenException('إضافة أدمن متاحة للأدمن فقط');
    }
    const stored = current.password ?? '';
    const valid = typeof currentPassword === 'string' && currentPassword.length > 0 && stored.length > 0
      && (isBcryptHash(stored)
        ? await bcrypt.compare(currentPassword, stored)
        : legacyMatches(currentPassword, stored));
    if (!valid) throw new BadRequestException('كلمة مرور حسابك غير صحيحة');
    return current;
  }

  // This step does not grant a reusable authorization. Creation verifies again.
  async verify(actor: JwtUser, currentPassword: string) {
    await this.checkedActor(actor, currentPassword);
    return { verified: true };
  }

  async create(actor: JwtUser, dto: CreateAdminAccountDto) {
    const current = await this.checkedActor(actor, dto.currentPassword);
    const username = dto.username?.trim();
    if (!username || username.length < 5 || username.length > 40 || /^_retired_/i.test(username)) {
      throw new BadRequestException('اسم المستخدم يجب أن يكون من ٥ إلى ٤٠ حرف');
    }
    if (typeof dto.password !== 'string' || dto.password.length < 5 || Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('كلمة المرور يجب ألا تقل عن ٥ أحرف وألا تكون طويلة جدًا');
    }
    const password = await bcrypt.hash(dto.password, 12);
    return this.prisma.$transaction(async (tx) => {
      // All staff-creation paths use this stable lock on schemas without a
      // UNIQUE username index. Never lock an employee or create an employee row.
      await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 ORDER BY user_id LIMIT 1 FOR UPDATE`;
      const fresh = await tx.users.findUnique({
        where: { user_id: actor.sub },
        select: { level: true, approved: true, password: true },
      });
      if (!fresh || fresh.level !== 1 || fresh.approved !== 1) {
        throw new ForbiddenException('إضافة أدمن متاحة للأدمن فقط');
      }
      if (fresh.password !== current.password) {
        throw new BadRequestException('كلمة مرور حسابك اتغيرت، اكتبها مرة تانية');
      }
      const duplicate = await tx.users.findFirst({
        where: { OR: [{ username }, { email: username }] },
        select: { user_id: true },
      });
      if (duplicate) throw new ConflictException('اسم المستخدم مسجل من قبل');
      const created = await tx.users.create({
        data: {
          username, name: username, password, level: 1, approved: 1,
          emp_code: null, branch_id_fk: null, role_id_fk: 1,
        },
        select: PUBLIC_FIELDS,
      });
      return { ...created, level_label: 'مدير على النظام' };
    });
  }
}

