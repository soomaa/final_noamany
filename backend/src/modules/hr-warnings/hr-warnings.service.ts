import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { todayIso } from '../../common/utils/legacy-date.util';
import { insertLegacyNotification } from '../../common/utils/legacy-notification.util';
import {
  CreateWarningDto,
  CreateWarningTemplateDto,
  SendToEmpDto,
  UpdateWarningDto,
  UpdateWarningTemplateDto,
} from './dto/warning.dto';
import { ListWarningsDto } from './dto/list-warnings.dto';

@Injectable()
export class HrWarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListWarningsDto, user?: JwtUser) {
    const and: Prisma.hr_enzaratWhereInput[] = [];
    if (user && user.level !== 1) {
      and.push({
        OR: [
          { publisher: user.sub },
          { current_to_user_id: user.sub },
          { direct_manager_user_id: user.sub },
          ...(user.emp_code != null ? [{ emp_name_id: user.emp_code }] : []),
        ],
      });
    }
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
      time: row.enzar_time,
      department: row.emp_edara,
      section: row.emp_qesm,
      details: row.details,
      seen: row.seen === 1,
      status: row.actions_sends,
      canEdit: user?.level === 1 || row.publisher === user?.sub || row.direct_manager_user_id === user?.sub,
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

  async listTemplates(q: PaginationDto) {
    const where: Prisma.hr_general_settingWhereInput = { ttype: 'enzar' };
    if (q.search?.trim()) {
      const search = q.search.trim();
      where.OR = [
        { title_setting: { contains: search } },
        { details: { contains: search } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.hr_general_setting.findMany({
        where,
        orderBy: { id_setting: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_general_setting.count({ where }),
    ]);
    return paginated(
      rows.map((row) => ({
        id: row.id_setting,
        title: row.title_setting,
        details: row.details ?? '',
        status: row.status_setting ?? 'active',
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async createTemplate(dto: CreateWarningTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      const max = await tx.hr_general_setting.aggregate({ _max: { id_setting: true } });
      const id = (max._max.id_setting ?? -1) + 1;
      await tx.hr_general_setting.create({
        data: {
          id_setting: id,
          title_setting: dto.title.trim(),
          ttype: 'enzar',
          form_id: 0,
          status_setting: 'active',
          details: dto.details?.trim() || null,
        },
      });
      return { id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateTemplate(id: number, dto: UpdateWarningTemplateDto) {
    await this.findTemplateOrThrow(id);
    await this.prisma.hr_general_setting.update({
      where: { id_setting: id },
      data: {
        ...(dto.title != null ? { title_setting: dto.title.trim() } : {}),
        ...(dto.details != null ? { details: dto.details.trim() || null } : {}),
      },
    });
    return { id };
  }

  async removeTemplate(id: number) {
    await this.findTemplateOrThrow(id);
    await this.prisma.hr_general_setting.delete({ where: { id_setting: id } });
    return { id };
  }

  async getOne(id: number, user?: JwtUser) {
    const row = await this.findOrThrow(id);
    if (user) this.assertCanView(row, user);
    const [attachments, history] = await Promise.all([
      this.prisma.hr_enzarat_files.findMany({ where: { main_id_fk: id }, orderBy: { id: 'asc' } }),
      this.prisma.hr_enzarat_history.findMany({ where: { talab_id_fk: id }, orderBy: { id: 'asc' } }),
    ]);
    return {
      id: row.id,
      empId: row.emp_name_id,
      employeeName: row.emp_name,
      employeeUserId: row.emp_user_id,
      department: row.emp_edara,
      departmentId: row.emp_edara_id,
      section: row.emp_qesm,
      sectionId: row.emp_qesm_id,
      typeId: row.enzar_type_id,
      type: row.enzar_type,
      details: row.details,
      date: row.enzar_date_ar,
      time: row.enzar_time,
      status: row.actions_sends,
      hrNotes: row.hr_notes,
      seen: row.seen === 1,
      seenDate: row.seen_date,
      seenTime: row.seen_time,
      publisherName: row.publisher_name,
      canEdit: !user || user.level === 1 || row.publisher === user.sub || row.direct_manager_user_id === user.sub,
      attachments: attachments.map((file) => ({ id: file.id, title: file.title, file: file.file })),
      history: history.map((item) => ({
        id: item.id,
        from: item.from_user_n,
        to: item.to_user_n,
        action: item.process_title,
        date: item.date_ar,
        time: item.time_ar,
        comment: item.comment,
      })),
    };
  }

  async create(dto: CreateWarningDto, publisherId?: number, publisherName?: string | null) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const type = await this.prisma.hr_general_setting.findUnique({ where: { id_setting: dto.typeId } });
    if (!type) throw new NotFoundException('نوع الإنذار غير موجود');

    const dateStr = dto.date ?? todayIso();
    const ts = String(Math.floor(new Date(dateStr).getTime() / 1000));
    const managerId = emp.manger ? parseInt(emp.manger, 10) : null;
    // users.emp_code stores employees.id in the legacy schema.
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
        enzar_time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        publisher: publisherId,
        publisher_name: publisherName,
        current_from_user_id: publisherId,
        current_from_user_name: publisherName,
        current_to_user_id: toUser?.user_id ?? null,
        current_to_user_name: toUser?.name ?? emp.employee,
        actions_sends: 'send_to_emp',
      },
    });
    await this.replaceAttachments(row.id, dto.attachments ?? [], dateStr);
    return { id: row.id };
  }

  async update(id: number, dto: UpdateWarningDto, user: JwtUser) {
    const existing = await this.findOrThrow(id);
    this.assertCanManage(existing, user);

    const empId = dto.empId ?? existing.emp_name_id;
    const typeId = dto.typeId ?? existing.enzar_type_id;
    if (empId == null) throw new NotFoundException('الموظف غير موجود');
    if (typeId == null) throw new NotFoundException('نوع الإنذار غير موجود');
    const [emp, type] = await Promise.all([
      this.prisma.employees.findUnique({ where: { id: empId } }),
      this.prisma.hr_general_setting.findFirst({ where: { id_setting: typeId, ttype: 'enzar' } }),
    ]);
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    if (!type) throw new NotFoundException('نوع الإنذار غير موجود');

    const dateStr = dto.date ?? existing.enzar_date_ar ?? todayIso();
    const managerId = emp.manger ? parseInt(emp.manger, 10) : null;
    const [empUser, mgrUser] = await Promise.all([
      this.prisma.users.findFirst({ where: { emp_code: emp.id } }),
      managerId ? this.prisma.users.findFirst({ where: { emp_code: managerId } }) : null,
    ]);
    await this.prisma.hr_enzarat.update({
      where: { id },
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
        ...(dto.details != null ? { details: dto.details } : {}),
        enzar_date: String(Math.floor(new Date(dateStr).getTime() / 1000)),
        enzar_date_ar: dateStr,
        current_to_user_id: empUser?.user_id ?? null,
        current_to_user_name: empUser?.name ?? emp.employee,
      },
    });
    if (dto.attachments != null) await this.replaceAttachments(id, dto.attachments, dateStr);
    return { id };
  }

  async sendToHr(id: number, userId?: number, userName?: string | null) {
    await this.findOrThrow(id);
    const hrRecipient = await this.resolveByMosama(401);
    await this.prisma.hr_enzarat.update({
      where: { id },
      data: { send_to_hr: 'yes', actions_sends: 'send_to_hr' },
    });
    await this.writeHistory(id, userId, userName, hrRecipient?.userId, 'إرسال للموارد البشرية');
    await insertLegacyNotification(this.prisma, id, 960, userId, hrRecipient?.userId);
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
    await insertLegacyNotification(this.prisma, id, 961, userId, row.emp_user_id);
    await insertLegacyNotification(this.prisma, id, 961, userId, row.direct_manager_user_id);
    return { id, status: 'send_to_emp' };
  }

  async remove(id: number, user?: JwtUser) {
    const row = await this.findOrThrow(id);
    if (user) this.assertCanManage(row, user);
    await this.prisma.hr_enzarat_files.deleteMany({ where: { main_id_fk: id } });
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
        time_ar: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
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

  private assertCanView(row: {
    publisher: number | null;
    current_to_user_id: number | null;
    direct_manager_user_id: number | null;
    emp_name_id: number | null;
  }, user: JwtUser) {
    if (user.level === 1 || row.publisher === user.sub || row.current_to_user_id === user.sub
      || row.direct_manager_user_id === user.sub || row.emp_name_id === user.emp_code) return;
    throw new ForbiddenException('غير مصرح بعرض هذا الإنذار');
  }

  private assertCanManage(row: {
    publisher: number | null;
    direct_manager_user_id: number | null;
  }, user: JwtUser) {
    if (user.level === 1 || row.publisher === user.sub || row.direct_manager_user_id === user.sub) return;
    throw new ForbiddenException('غير مصرح بتعديل هذا الإنذار');
  }

  private async replaceAttachments(
    id: number,
    attachments: Array<{ title: string; file: string }>,
    dateStr: string,
  ) {
    await this.prisma.hr_enzarat_files.deleteMany({ where: { main_id_fk: id } });
    const timestamp = Math.floor(new Date(dateStr).getTime() / 1000);
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    for (const attachment of attachments) {
      await this.prisma.hr_enzarat_files.create({
        data: {
          main_id_fk: id,
          title: attachment.title,
          file: attachment.file,
          date: timestamp,
          date_ar: dateStr,
          time,
        },
      });
    }
  }

  private async findTemplateOrThrow(id: number) {
    const row = await this.prisma.hr_general_setting.findFirst({
      where: { id_setting: id, ttype: 'enzar' },
    });
    if (!row) throw new NotFoundException('نموذج الإنذار غير موجود');
    return row;
  }

  private async resolveByMosama(code: number) {
    const setting = await this.prisma.hr_egraat_emp_setting.findFirst({
      where: { job_title_code_fk: code, person_suspend: 1 },
    });
    if (!setting?.person_id) return null;
    const user = await this.prisma.users.findFirst({ where: { emp_code: setting.person_id } });
    return user ? { userId: user.user_id, name: setting.person_name ?? user.name } : null;
  }
}
