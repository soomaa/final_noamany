import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import { cairoTimeString, dateOnlyEpochSeconds } from '../../common/utils/cairo-date';
import { CreateWarningDto, SendToEmpDto } from './dto/warning.dto';
import { ListWarningsDto } from './dto/list-warnings.dto';

@Injectable()
export class HrWarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListWarningsDto) {
    const and: Prisma.hr_enzaratWhereInput[] = [];
    if (q.status?.trim()) and.push({ actions_sends: q.status.trim() });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { emp_name: { contains: s } },
          { enzar_type: { contains: s } },
          { details: { contains: s } },
        ],
      });
    }

    const where: Prisma.hr_enzaratWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_enzarat.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_enzarat.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      title: row.enzar_type,
      employeeName: row.emp_name,
      createdAt: row.enzar_date_ar,
      status: row.actions_sends,
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async listTypes() {
    const rows = await this.prisma.hr_general_setting.findMany({
      where: { ttype: 'enzar', status_setting: 'active' },
      orderBy: { id_setting: 'asc' },
    });
    return rows.map((r) => ({ id: r.id_setting, title: r.title_setting, details: r.details }));
  }

  async create(dto: CreateWarningDto, publisherId?: number, publisherName?: string | null) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const type = await this.prisma.hr_general_setting.findUnique({ where: { id_setting: dto.typeId } });
    if (!type) throw new NotFoundException('نوع الإنذار غير موجود');

    const dateStr = dto.date ?? todayIso();
    const ts = String(dateOnlyEpochSeconds(dateStr));
    const managerId = emp.manger ? parseInt(emp.manger, 10) : null;
    const empUser = await this.prisma.users.findFirst({ where: { emp_code: emp.id } });
    const mgrUser = managerId
      ? await this.prisma.users.findFirst({ where: { emp_code: managerId } })
      : null;
    const toUser = empUser;

    const row = await this.prisma.hr_enzarat.create({
      data: {
        emp_name: emp.employee,
        emp_name_id: emp.id,
        emp_user_id: empUser?.user_id ?? null,
        emp_edara: emp.edara_n,
        emp_edara_id: emp.edara_id,
        emp_qesm: emp.qsm_n,
        emp_qesm_id: emp.qsm_id,
        direct_manager_emp_id: managerId,
        direct_manager_user_id: mgrUser?.user_id ?? null,
        enzar_type: type.title_setting,
        enzar_type_id: type.id_setting,
        details: dto.details,
        enzar_date: ts,
        enzar_date_ar: dateStr,
        enzar_time: cairoTimeString(),
        publisher: publisherId,
        publisher_name: publisherName,
        current_from_user_id: publisherId,
        current_from_user_name: publisherName,
        current_to_user_id: toUser?.user_id ?? null,
        current_to_user_name: toUser?.name ?? emp.employee,
        actions_sends: 'send_to_emp',
      },
    });
    return { id: row.id };
  }

  async sendToHr(id: number, userId?: number, userName?: string | null) {
    const row = await this.findOrThrow(id);
    await this.prisma.hr_enzarat.update({
      where: { id },
      data: { send_to_hr: 'yes', actions_sends: 'send_to_hr' },
    });
    await this.writeHistory(id, userId, userName, row.emp_user_id, 'إرسال للموارد البشرية');
    return { id, status: 'send_to_hr' };
  }

  async sendToEmp(id: number, dto: SendToEmpDto, userId?: number, userName?: string | null) {
    const row = await this.findOrThrow(id);
    await this.prisma.hr_enzarat.update({
      where: { id },
      data: {
        send_to_emp: 'yes',
        actions_sends: 'send_to_emp',
        ...(dto.hrNotes != null ? { hr_notes: dto.hrNotes } : {}),
      },
    });
    await this.writeHistory(id, userId, userName, row.emp_user_id, 'إرسال للموظف');
    return { id, status: 'send_to_emp' };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_enzarat_history.deleteMany({ where: { talab_id_fk: id } });
    await this.prisma.hr_enzarat.delete({ where: { id } });
    return { id };
  }

  private async writeHistory(
    talabId: number,
    fromUserId: number | undefined,
    fromUserName: string | null | undefined,
    toUserId: number | null | undefined,
    processTitle: string,
  ) {
    const toUser = toUserId
      ? await this.prisma.users.findUnique({ where: { user_id: toUserId } })
      : null;
    const dateStr = todayIso();
    await this.prisma.hr_enzarat_history.create({
      data: {
        talab_id_fk: talabId,
        from_user_id: fromUserId ?? null,
        from_user_n: fromUserName ?? null,
        to_user_id: toUserId ?? null,
        to_user_n: toUser?.name ?? null,
        process_title: processTitle,
        date_ar: dateStr,
        time_ar: cairoTimeString(),
      },
    });
    if (toUserId) {
      await this.prisma.hr_enzarat.update({
        where: { id: talabId },
        data: {
          current_from_user_id: fromUserId ?? null,
          current_from_user_name: fromUserName ?? null,
          current_to_user_id: toUserId,
          current_to_user_name: toUser?.name ?? null,
        },
      });
    }
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_enzarat.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الإنذار غير موجود');
    return row;
  }
}
