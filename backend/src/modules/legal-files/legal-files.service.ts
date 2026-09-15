import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import {
  AckLegalFileDto,
  CreateLegalFileDto,
  ListLegalFilesDto,
  UpdateLegalFileDto,
} from './dto/legal-files.dto';

@Injectable()
export class LegalFilesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListLegalFilesDto) {
    const and: Prisma.hr_lawyeh_filesWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ title: { contains: s } }, { details: { contains: s } }] });
    }

    const where: Prisma.hr_lawyeh_filesWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_lawyeh_files.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_lawyeh_files.count({ where }),
    ]);

    // seen-count per file (only rows actually acknowledged, seen=1)
    const data = await Promise.all(
      rows.map(async (row) => {
        const seenCount = await this.prisma.hr_lawyeh_files_seens.count({
          where: { layha_id_fk: row.id, seen: 1 },
        });
        return {
          id: row.id,
          title: row.title,
          details: row.details,
          file: row.f_file,
          userId: row.user_id,
          addedDate: row.added_date,
          addedTime: row.added_time,
          seenCount,
        };
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: number) {
    const row = await this.findOrThrow(id);
    const seens = await this.listSeens(id);
    return {
      id: row.id,
      title: row.title,
      details: row.details,
      file: row.f_file,
      userId: row.user_id,
      addedDate: row.added_date,
      addedTime: row.added_time,
      seenCount: seens.length,
      seens,
    };
  }

  async create(dto: CreateLegalFileDto, user: JwtUser) {
    const now = new Date();
    const row = await this.prisma.hr_lawyeh_files.create({
      data: {
        title: dto.title.trim(),
        details: dto.details?.trim() || null,
        f_file: dto.file ?? null,
        user_id: user.sub,
        added_date: now.toISOString().slice(0, 10),
        added_time: now.toTimeString().slice(0, 5),
      },
    });
    return { id: row.id };
  }

  async update(id: number, dto: UpdateLegalFileDto) {
    await this.findOrThrow(id);
    await this.prisma.hr_lawyeh_files.update({
      where: { id },
      data: {
        ...(dto.title != null ? { title: dto.title.trim() } : {}),
        ...(dto.details != null ? { details: dto.details.trim() || null } : {}),
        ...(dto.file != null ? { f_file: dto.file } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    // legacy cascades the acknowledgement rows when a file is deleted.
    await this.prisma.hr_lawyeh_files_seens.deleteMany({ where: { layha_id_fk: id } });
    await this.prisma.hr_lawyeh_files.delete({ where: { id } });
    return { id };
  }

  /**
   * Acknowledge ("تأكيد الاطلاع") a legal file for the current user.
   * Upserts the per-user hr_lawyeh_files_seens row (seen=1, date/time now).
   */
  async ack(id: number, dto: AckLegalFileDto, user: JwtUser) {
    await this.findOrThrow(id);
    const now = new Date();
    const seenDate = now.toISOString().slice(0, 10);
    const seenTime = now.toTimeString().slice(0, 5);

    const existing = await this.prisma.hr_lawyeh_files_seens.findFirst({
      where: { layha_id_fk: id, user_id_fk: user.sub },
    });

    if (existing) {
      await this.prisma.hr_lawyeh_files_seens.update({
        where: { id: existing.id },
        data: {
          seen: 1,
          seen_date: seenDate,
          seen_time: seenTime,
          ...(dto.empId != null ? { emp_id_fk: dto.empId } : {}),
        },
      });
      return { id: existing.id, fileId: id };
    }

    const row = await this.prisma.hr_lawyeh_files_seens.create({
      data: {
        layha_id_fk: id,
        emp_id_fk: dto.empId ?? null,
        user_id_fk: user.sub,
        seen: 1,
        seen_date: seenDate,
        seen_time: seenTime,
      },
    });
    return { id: row.id, fileId: id };
  }

  /** Who acknowledged this file, with resolved employee names. */
  async listSeens(id: number) {
    await this.findOrThrow(id);
    const rows = await this.prisma.hr_lawyeh_files_seens.findMany({
      where: { layha_id_fk: id, seen: 1 },
      orderBy: { id: 'desc' },
    });

    return Promise.all(
      rows.map(async (r) => {
        // emp_id_fk is the preferred link; fall back to the user-mapped employee.
        const emp = r.emp_id_fk
          ? await this.prisma.employees.findUnique({ where: { id: r.emp_id_fk } })
          : null;
        return {
          id: r.id,
          empId: r.emp_id_fk,
          userId: r.user_id_fk,
          employeeName: emp?.employee ?? '',
          seenDate: r.seen_date,
          seenTime: r.seen_time,
        };
      }),
    );
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_lawyeh_files.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الملف غير موجود');
    return row;
  }
}
