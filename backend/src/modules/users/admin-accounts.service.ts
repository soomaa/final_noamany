import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
import { isBcryptHash, legacyMatches } from '../auth/legacy-hash.util';
import { CreateAdminAccountDto } from './dto/admin-account.dto';
import { isRetiredUsername } from './users.service';

const PUBLIC_FIELDS = {
  user_id: true, username: true, name: true, level: true,
  emp_code: true, branch_id_fk: true, approved: true,
} as const;

/**
 * حسابات النظام → «Add Admin» (ported from MetaFit). The acting admin re-types their own
 * password first; creation checks it again, so the verify step grants nothing reusable.
 */
@Injectable()
export class AdminAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private async checkedActor(actor: JwtUser, currentPassword: string) {
    if (!actor || !isSystemAdmin(actor)) throw new ForbiddenException('إضافة أدمن متاحة للأدمن فقط');
    const current = await this.prisma.users.findUnique({
      where: { user_id: actor.sub },
      select: { user_id: true, approved: true, password: true },
    });
    if (!current || current.approved !== 1) throw new ForbiddenException('إضافة أدمن متاحة للأدمن فقط');
    const stored = current.password ?? '';
    const valid = typeof currentPassword === 'string' && currentPassword.length > 0 && stored.length > 0
      && (isBcryptHash(stored) ? await bcrypt.compare(currentPassword, stored) : legacyMatches(currentPassword, stored));
    if (!valid) throw new BadRequestException('كلمة مرور حسابك غير صحيحة');
    return current;
  }

  async verify(actor: JwtUser, currentPassword: string) {
    await this.checkedActor(actor, currentPassword);
    return { verified: true };
  }

  async create(actor: JwtUser, dto: CreateAdminAccountDto) {
    await this.checkedActor(actor, dto.currentPassword);
    const username = dto.username?.trim() ?? '';
    if (username.length < 3 || username.length > 40 || isRetiredUsername(username)) {
      throw new BadRequestException('اسم المستخدم يجب أن يكون من ٣ إلى ٤٠ حرف');
    }
    if (typeof dto.password !== 'string' || dto.password.length < 5 || Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('كلمة المرور يجب ألا تقل عن ٥ أحرف وألا تكون طويلة جدًا');
    }
    const clash = await this.prisma.users.findFirst({ where: { username }, select: { user_id: true } });
    if (clash) throw new ConflictException('اسم المستخدم مسجل من قبل');
    const superAdmin = await this.prisma.rbac_roles.findUnique({ where: { key: 'super_admin' }, select: { id: true } });
    const password = await bcrypt.hash(dto.password, 12);
    const created = await this.prisma.users.create({
      data: {
        username,
        name: dto.fullname?.trim() || username,
        password,
        level: 1,
        approved: 1,
        role_id_fk: superAdmin?.id ?? null,
        must_change_password: false,
      },
      select: PUBLIC_FIELDS,
    });
    if (superAdmin) {
      await this.prisma.rbac_user_roles.create({
        data: { user_id: created.user_id, role_id: superAdmin.id, created_by: actor.sub },
      });
    }
    return { ...created, level_label: 'ادمن', roles: ['ادمن'] };
  }
}
