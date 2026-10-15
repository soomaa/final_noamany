import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GymSettingType, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { assertPositive, assertUnique } from '../../common/validators/validation.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { cairoDateString } from '../../common/utils/cairo-date';

@Injectable()
export class GymRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: PaginationDto) {
    const where: Prisma.tbl_gym_settingWhereInput = {};
    if (q.search?.trim()) {
      where.ttype = q.search.trim() as GymSettingType;
    }
    const [rows, total] = await Promise.all([
      this.prisma.tbl_gym_setting.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.tbl_gym_setting.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      title: r.ttype,
      forUser: r.for_user,
      forGym: r.for_gym,
      createdAt: r.date_ar,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  private assertRateSplit(forUser: number, forGym: number) {
    if (forUser < 0 || forGym < 0) {
      throw new BadRequestException('نسب العمولة لا يمكن أن تكون سالبة');
    }
    if (forUser + forGym !== 100) {
      throw new BadRequestException(`مجموع نسب الموظف والجيم يجب أن يساوي 100% (الحالي: ${forUser + forGym}%)`);
    }
  }

  async create(body: { ttype: string; forUser: number; forGym: number }, publisherId?: number, publisherName?: string | null) {
    assertPositive(body.forUser, 'نسبة الموظف', true);
    assertPositive(body.forGym, 'نسبة الجيم', true);
    this.assertRateSplit(body.forUser, body.forGym);
    await assertUnique(
      () => this.prisma.tbl_gym_setting.findFirst({ where: { ttype: body.ttype as GymSettingType } }),
      'يوجد إعداد نسبة مسبقًا لنفس النوع',
    );

    const now = new Date();
    const row = await this.prisma.tbl_gym_setting.create({
      data: {
        ttype: body.ttype as GymSettingType,
        for_user: body.forUser,
        for_gym: body.forGym,
        date_ar: cairoDateString(now),
        date_s: String(Math.floor(now.getTime() / 1000)),
        publisher: publisherId ?? 0,
        publisher_name: publisherName ?? '',
      },
    });
    return { id: row.id };
  }

  async update(id: number, body: { ttype?: string; forUser?: number; forGym?: number }, publisherId?: number, publisherName?: string | null) {
    const existing = await this.findOrThrow(id);
    const forUser = body.forUser ?? existing.for_user ?? 0;
    const forGym = body.forGym ?? existing.for_gym ?? 0;
    this.assertRateSplit(forUser, forGym);

    if (body.ttype && body.ttype !== existing.ttype) {
      const dup = await this.prisma.tbl_gym_setting.findFirst({
        where: { ttype: body.ttype as GymSettingType, NOT: { id } },
      });
      if (dup) throw new ConflictException('يوجد إعداد نسبة مسبقًا لنفس النوع');
    }

    const now = new Date();
    await this.prisma.tbl_gym_setting.update({
      where: { id },
      data: {
        ...(body.ttype != null ? { ttype: body.ttype as GymSettingType } : {}),
        ...(body.forUser != null ? { for_user: body.forUser } : {}),
        ...(body.forGym != null ? { for_gym: body.forGym } : {}),
        date_ar: cairoDateString(now),
        date_s: String(Math.floor(now.getTime() / 1000)),
        ...(publisherId != null ? { publisher: publisherId } : {}),
        ...(publisherName != null ? { publisher_name: publisherName } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.tbl_gym_setting.delete({ where: { id } });
    return { id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.tbl_gym_setting.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('إعداد الجيم غير موجود');
    return row;
  }
}
