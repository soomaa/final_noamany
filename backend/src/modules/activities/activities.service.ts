import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import {
  AddActivityFileDto,
  CreateActivityDto,
  ListActivitiesDto,
  RejectActivityDto,
  UpdateActivityDto,
} from './dto/activities.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly activityFields = {
    id: true,
    emp_id: true,
    title: true,
    send_date: true,
    send_time: true,
    suspend: true,
    notes: true,
    rad_notes: true,
  } satisfies Prisma.hr_anshetaSelect;

  async list(q: ListActivitiesDto) {
    const and: Prisma.hr_anshetaWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ title: { contains: s } }, { notes: { contains: s } }] });
    }

    const where: Prisma.hr_anshetaWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_ansheta.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
        // Keep read compatibility with databases that have not yet applied
        // the optional mobile-source migration.
        select: this.activityFields,
      }),
      this.prisma.hr_ansheta.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => {
        const emp = row.emp_id
          ? await this.prisma.employees.findUnique({
              where: { id: row.emp_id },
              select: { employee: true },
            })
          : null;
        const fileCount = await this.prisma.hr_ansheta_files.count({
          where: { main_id_fk: row.id },
        });
        return {
          id: row.id,
          empId: row.emp_id,
          employeeName: emp?.employee ?? '',
          title: row.title,
          date: row.send_date,
          time: row.send_time,
          status: row.suspend,
          notes: row.notes,
          radNotes: row.rad_notes,
          fileCount,
        };
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: number) {
    const row = await this.findOrThrow(id);
    const emp = row.emp_id
      ? await this.prisma.employees.findUnique({
          where: { id: row.emp_id },
          select: { employee: true },
        })
      : null;
    const files = await this.prisma.hr_ansheta_files.findMany({
      where: { main_id_fk: id },
      orderBy: { id: 'desc' },
    });
    return {
      id: row.id,
      empId: row.emp_id,
      employeeName: emp?.employee ?? '',
      title: row.title,
      date: row.send_date,
      time: row.send_time,
      status: row.suspend,
      notes: row.notes,
      radNotes: row.rad_notes,
      files: files.map((f) => ({
        id: f.id,
        fileName: f.file_name,
        uploadedOn: f.uploaded_on,
      })),
    };
  }

  async create(dto: CreateActivityDto, user: JwtUser) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const now = new Date();
    const row = await this.prisma.hr_ansheta.create({
      data: {
        emp_id: dto.empId,
        title: dto.title,
        notes: dto.notes ?? null,
        send_date: now.toISOString().slice(0, 10), // 'YYYY-MM-DD'
        send_time: now.toTimeString().slice(0, 5), // 'HH:MM'
        suspend: SuspendStatus.INCOMING,
      },
    });
    return { id: row.id };
  }

  async update(id: number, dto: UpdateActivityDto) {
    await this.findOrThrow(id);
    if (dto.empId != null) {
      const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
      if (!emp) throw new NotFoundException('الموظف غير موجود');
    }
    await this.prisma.hr_ansheta.update({
      where: { id },
      data: {
        ...(dto.empId != null ? { emp_id: dto.empId } : {}),
        ...(dto.title != null ? { title: dto.title } : {}),
        ...(dto.notes != null ? { notes: dto.notes } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    // Cascade-delete the gallery rows first (no FK in legacy schema).
    await this.prisma.hr_ansheta_files.deleteMany({ where: { main_id_fk: id } });
    await this.prisma.hr_ansheta.delete({ where: { id } });
    return { id };
  }

  async approve(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_ansheta.update({
      where: { id },
      data: { suspend: SuspendStatus.APPROVED, rad_notes: null },
    });
    return { id, status: SuspendStatus.APPROVED };
  }

  async reject(id: number, dto: RejectActivityDto) {
    await this.findOrThrow(id);
    await this.prisma.hr_ansheta.update({
      where: { id },
      data: { suspend: SuspendStatus.REJECTED, rad_notes: dto.radNotes ?? null },
    });
    return { id, status: SuspendStatus.REJECTED };
  }

  async listFiles(id: number) {
    await this.findOrThrow(id);
    const files = await this.prisma.hr_ansheta_files.findMany({
      where: { main_id_fk: id },
      orderBy: { id: 'desc' },
    });
    return files.map((f) => ({
      id: f.id,
      fileName: f.file_name,
      uploadedOn: f.uploaded_on,
    }));
  }

  async addFile(id: number, dto: AddActivityFileDto) {
    await this.findOrThrow(id);
    const row = await this.prisma.hr_ansheta_files.create({
      data: {
        main_id_fk: id,
        file_name: dto.fileName,
        uploaded_on: new Date().toISOString().slice(0, 10),
      },
    });
    return { id: row.id };
  }

  async removeFile(fileId: number) {
    const file = await this.prisma.hr_ansheta_files.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('الصورة غير موجودة');
    await this.prisma.hr_ansheta_files.delete({ where: { id: fileId } });
    return { id: fileId };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_ansheta.findUnique({
      where: { id },
      select: this.activityFields,
    });
    if (!row) throw new NotFoundException('النشاط غير موجود');
    return row;
  }
}
