import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { cairoDateString } from '../../common/utils/cairo-date';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import {
  AddActivityFileDto,
  CreateActivityDto,
  ListActivitiesDto,
  RejectActivityDto,
  UpdateActivityDto,
} from './dto/activities.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService, private readonly scope: HrDataScopeService) {}

  async list(q: ListActivitiesDto, user: JwtUser) {
    const and: Prisma.hr_anshetaWhereInput[] = [];
    const identities = await this.scope.employeeIdentities(user, 'affairs.activities');
    if (identities) and.push(identities.ids.length ? { emp_id: { in: identities.ids } } : { id: -1 });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ title: { contains: s } }, { notes: { contains: s } }] });
    }

    const where: Prisma.hr_anshetaWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_ansheta.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_ansheta.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => {
        const emp = row.emp_id
          ? await this.prisma.employees.findUnique({ where: { id: row.emp_id } })
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

  async get(id: number, user: JwtUser) {
    const row = await this.findScopedOrThrow(id, user);
    const emp = row.emp_id
      ? await this.prisma.employees.findUnique({ where: { id: row.emp_id } })
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
    await this.scope.assertEmployeeInScope(user, dto.empId, 'affairs.activities');
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const now = new Date();
    const row = await this.prisma.hr_ansheta.create({
      data: {
        emp_id: dto.empId,
        title: dto.title,
        notes: dto.notes ?? null,
        send_date: cairoDateString(now),
        send_time: now.toTimeString().slice(0, 5), // 'HH:MM'
        suspend: SuspendStatus.INCOMING,
      },
    });
    // NOTE: legacy stamps a publisher per activity; the rebuilt table keeps no
    // publisher column, so user context is accepted but not persisted here.
    void user;
    return { id: row.id };
  }

  async update(id: number, dto: UpdateActivityDto, user: JwtUser) {
    await this.findScopedOrThrow(id, user);
    if (dto.empId != null) {
      await this.scope.assertEmployeeInScope(user, dto.empId, 'affairs.activities');
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

  async remove(id: number, user: JwtUser) {
    await this.findScopedOrThrow(id, user);
    // Cascade-delete the gallery rows first (no FK in legacy schema).
    await this.prisma.hr_ansheta_files.deleteMany({ where: { main_id_fk: id } });
    await this.prisma.hr_ansheta.delete({ where: { id } });
    return { id };
  }

  async approve(id: number, user: JwtUser) {
    await this.findScopedOrThrow(id, user);
    await this.prisma.hr_ansheta.update({
      where: { id },
      data: { suspend: SuspendStatus.APPROVED, rad_notes: null },
    });
    return { id, status: SuspendStatus.APPROVED };
  }

  async reject(id: number, dto: RejectActivityDto, user: JwtUser) {
    await this.findScopedOrThrow(id, user);
    await this.prisma.hr_ansheta.update({
      where: { id },
      data: { suspend: SuspendStatus.REJECTED, rad_notes: dto.radNotes ?? null },
    });
    return { id, status: SuspendStatus.REJECTED };
  }

  async listFiles(id: number, user: JwtUser) {
    await this.findScopedOrThrow(id, user);
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

  async addFile(id: number, dto: AddActivityFileDto, user: JwtUser) {
    await this.findScopedOrThrow(id, user);
    const row = await this.prisma.hr_ansheta_files.create({
      data: {
        main_id_fk: id,
        file_name: dto.fileName,
        uploaded_on: cairoDateString(),
      },
    });
    return { id: row.id };
  }

  async removeFile(fileId: number, user: JwtUser) {
    const file = await this.prisma.hr_ansheta_files.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('الصورة غير موجودة');
    if (file.main_id_fk == null) throw new NotFoundException('الصورة غير موجودة');
    await this.findScopedOrThrow(file.main_id_fk, user);
    await this.prisma.hr_ansheta_files.delete({ where: { id: fileId } });
    return { id: fileId };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_ansheta.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('النشاط غير موجود');
    return row;
  }

  private async findScopedOrThrow(id: number, user: JwtUser) {
    const row = await this.findOrThrow(id);
    if (row.emp_id == null) throw new NotFoundException('النشاط غير موجود');
    await this.scope.assertEmployeeInScope(user, row.emp_id, 'affairs.activities');
    return row;
  }
}
