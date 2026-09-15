import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';

export type LegacyInput = Record<string, unknown>;

// Never hydrate the full legacy employees row in the app API. Real imported
// data may contain historical values outside Prisma's enums in unused columns.
const APP_EMPLOYEE_SELECT = {
  id: true,
  emp_code: true,
  branch_id_fk: true,
  employee: true,
  card_num: true,
  phone: true,
  edara_n: true,
  qsm_n: true,
  mosma_wazefy_n: true,
  personal_photo: true,
  users_signatures: true,
  neqat_total: true,
  manger: true,
} as const;

/**
 * Compatibility operations used by the installed employee Flutter app.
 *
 * The old controller trusted posted user_id/emp_id values. This adapter keeps
 * the field names and response rows, but derives the acting employee from the
 * signed JWT. That prevents one employee from reading or changing another
 * employee's records by editing a request body.
 */
@Injectable()
export class LegacyMobileCompatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  private text(input: LegacyInput, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = input[key];
      if (value != null && String(value).trim() !== '') return String(value).trim();
    }
    return undefined;
  }

  private positiveId(input: LegacyInput, ...keys: string[]): number {
    const value = Number(this.text(input, ...keys));
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException('تأكد من البيانات المدخلة');
    }
    return value;
  }

  private paging(input: LegacyInput) {
    const page = Math.max(1, Number(this.text(input, 'page') ?? 1) || 1);
    const perPage = Math.min(100, Math.max(1, Number(this.text(input, 'per_page', 'perPage') ?? 20) || 20));
    return { page, perPage, skip: (page - 1) * perPage };
  }

  private now() {
    const date = new Date();
    return {
      date: date.toISOString().slice(0, 10),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      month: date.getMonth() + 1,
      year: date.getFullYear(),
    };
  }

  private async employee(user: JwtUser) {
    // Legacy invariant: users.emp_code stores employees.id.
    if (user.emp_code == null) throw new ForbiddenException('الحساب غير مرتبط بموظف');
    const employee = await this.prisma.employees.findUnique({
      where: { id: user.emp_code },
      select: APP_EMPLOYEE_SELECT,
    });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    return employee;
  }

  async appInfo() {
    const row = await this.prisma.am_about_app.findFirst({ orderBy: { id: 'asc' } });
    return row
      ? [{ app_name: row.app_name, about_app: row.description, app_logo: null,
          app_version: row.app_version, contact_email: row.contact_email,
          contact_phone: row.contact_phone, website: row.website }]
      : [];
  }

  async identity(user: JwtUser) {
    const emp = await this.employee(user);
    return { id: emp.id, empCode: emp.emp_code ?? emp.id, branchId: emp.branch_id_fk ?? undefined,
      name: emp.employee ?? '' };
  }

  async checkOption(input: LegacyInput) {
    const option = this.text(input, 'emp_option');
    const value = this.text(input, 'emp_value');
    if (!option || !value) throw new BadRequestException('تأكد من صحة البيانات المدخلة');
    const employee = await this.prisma.employees.findFirst({
      where: option === 'code'
        ? { emp_code: Number(value) }
        : option === 'mob' ? { phone: { contains: value } } : { id: -1 },
      select: APP_EMPLOYEE_SELECT,
    });
    if (!employee) throw new NotFoundException(option === 'code' ? 'الكود الوظيفي غير موجود' : 'رقم الجوال غير موجود');
    const account = await this.prisma.users.findFirst({ where: { emp_code: employee.id, approved: 1 } });
    return { user_id: String(account?.user_id ?? ''), emp_id: String(employee.id),
      employee: employee.employee ?? '', emp_code: String(employee.emp_code ?? ''),
      card_num: String(employee.card_num ?? ''), phone_number: employee.phone ?? '',
      edara_name: employee.edara_n ?? '', qsm_name: employee.qsm_n ?? '',
      mosma_wazefy_name: employee.mosma_wazefy_n ?? '',
      emp_img: employee.personal_photo
        ? `/uploads/human_resources/emp_photo/thumbs/${employee.personal_photo}`
        : '/asisst/admin_asset/img/avatar5.png' };
  }

  async alertScreen() {
    return this.prisma.hr_alert_items.findMany({ orderBy: { id: 'asc' } });
  }

  async acceptAlert(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'eqrar_id', 'id');
    const alert = await this.prisma.hr_alert_items.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('رقم الإقرار غير موجود في النظام');
    const existing = await this.prisma.hr_alert_items_emps.findFirst({ where: { emp_id: emp.id, eqrar_id: id } });
    if (existing) throw new BadRequestException('تمت الإضافة مسبقًا لهذا الإقرار');
    const now = this.now();
    await this.prisma.hr_alert_items_emps.create({ data: { emp_id: emp.id, eqrar_id: id,
      action_date: now.date, action_time: now.time } });
    return '';
  }

  async appPolicy() {
    const row = await this.prisma.am_about_app.findFirst({ orderBy: { id: 'asc' } });
    return row?.privacy_policy ?? null;
  }

  async branches() {
    return this.prisma.tbl_sites.findMany({ orderBy: { id: 'asc' } });
  }

  async updatePassword(user: JwtUser, input: LegacyInput, requireCurrent = false) {
    const password = this.text(input, 'user_pass', 'new_password');
    const confirmation = this.text(input, 'confirm_user_pass', 'confirm_password');
    if (!password || !confirmation) throw new BadRequestException('كلمة المرور وتأكيدها مطلوبان');
    if (password !== confirmation) throw new BadRequestException('كلمة المرور غير متطابقة');
    if (password.length < 8) throw new BadRequestException('كلمة المرور يجب ألا تقل عن 8 أحرف');
    if (requireCurrent) {
      const current = this.text(input, 'current_pass', 'current_password');
      if (!current) throw new BadRequestException('كلمة المرور الحالية مطلوبة');
      await this.auth.changePassword(user.sub, current, password);
    } else {
      const hash = await bcrypt.hash(password, 12);
      await this.prisma.users.update({ where: { user_id: user.sub }, data: {
        password: hash, user_pass: null, app_pass: null, pass_demo: null, x_y_z: null,
      } });
    }
    return this.profileIdentity(user);
  }

  async updateProfileImage(user: JwtUser, input: LegacyInput, signature = false) {
    const emp = await this.employee(user);
    const filename = this.text(input, 'm_image', signature ? 'users_signatures' : 'personal_photo');
    if (!filename) throw new BadRequestException('لم يتم إرفاق صورة');
    await this.prisma.employees.update({ where: { id: emp.id }, data: signature
      ? { users_signatures: filename }
      : { personal_photo: filename } });
    return this.profileIdentity(user);
  }

  private async profileIdentity(user: JwtUser) {
    const emp = await this.employee(user);
    return { user_id: String(user.sub), emp_id: String(emp.id),
      emp_code: String(emp.emp_code ?? ''), employee: emp.employee ?? '',
      personal_photo: emp.personal_photo ?? '', users_signatures: emp.users_signatures ?? '',
      emp_img: emp.personal_photo ? `/uploads/human_resources/emp_photo/${emp.personal_photo}` : '/asisst/admin_asset/img/avatar5.png',
      emp_signature: emp.users_signatures ? `/uploads/emp_signatures/${emp.users_signatures}` : '/asisst/admin_asset/img/avatar5.png' };
  }

  async appServices(user: JwtUser) {
    await this.employee(user);
    return this.prisma.app_pages.findMany({
      where: { active: 'yes', id: { not: 14 } },
      orderBy: [{ page_order: 'asc' }, { id: 'asc' }],
    });
  }

  async employees(user: JwtUser, input: LegacyInput) {
    const current = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const search = this.text(input, 'search_title', 'search');
    const rows = await this.prisma.employees.findMany({
      where: {
        id: { not: current.id },
        employee_type: 1,
        branch_id_fk: current.branch_id_fk,
        ...(search ? { employee: { contains: search } } : {}),
      },
      orderBy: [{ emp_code: 'asc' }, { id: 'asc' }],
      skip,
      take: perPage,
      select: APP_EMPLOYEE_SELECT,
    });
    const accounts = await this.prisma.users.findMany({
      where: { emp_code: { in: rows.map((row) => row.id) }, approved: 1 },
      select: { user_id: true, emp_code: true },
    });
    const accountByEmployee = new Map(accounts.map((row) => [row.emp_code, row.user_id]));
    return rows.flatMap((row) => {
      const userId = accountByEmployee.get(row.id);
      if (!userId) return [];
      return [{
        emp_id: String(row.id), user_id: String(userId),
        card_num: row.card_num == null ? '' : String(row.card_num),
        emp_code: row.emp_code == null ? '' : String(row.emp_code),
        employee: row.employee ?? '', edara_name: row.edara_n ?? '',
        qsm_name: row.qsm_n ?? '', mosma_wazefy_name: row.mosma_wazefy_n ?? '',
        phone_number: row.phone ?? '', personal_photo: row.personal_photo ?? '',
        emp_img: row.personal_photo
          ? `/uploads/human_resources/emp_photo/thumbs/${row.personal_photo}`
          : '/asisst/admin_asset/img/avatar5.png',
      }];
    });
  }

  private parseRecipients(input: LegacyInput): number[] {
    const raw = input.to_user_ids ?? input.to_users ?? input.to_user_id;
    if (Array.isArray(raw)) return raw.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (raw == null) return [];
    const value = String(raw).trim();
    try {
      const decoded = JSON.parse(value);
      if (Array.isArray(decoded)) return decoded.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    } catch { /* comma-separated legacy clients */ }
    return value.split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
  }

  async sendMessage(user: JwtUser, input: LegacyInput) {
    const fromEmployee = await this.employee(user);
    const subject = this.text(input, 'subject');
    const message = this.text(input, 'message');
    const recipients = [...new Set(this.parseRecipients(input))];
    if (!subject || !message) throw new BadRequestException('عنوان الرسالة ونص الرسالة مطلوبان');
    if (!recipients.length) throw new BadRequestException('اختر موظفًا واحدًا على الأقل');
    const users = await this.prisma.users.findMany({
      where: { user_id: { in: recipients }, approved: 1 },
      select: { user_id: true, emp_code: true },
    });
    if (users.length !== recipients.length) throw new BadRequestException('أحد مستلمي الرسالة غير موجود');
    const now = this.now();
    const row = await this.prisma.$transaction(async (tx) => {
      const header = await tx.hr_ta3mem_personal_msg.create({ data: {
        msg_title: String(users.length), msg_date: now.date, msg_time: now.time,
        publisher: user.sub, from_user_id: user.sub, from_emp_id: fromEmployee.id,
        date_ar: now.date, date: now.date, for_month: now.month, for_year: now.year,
        subject, message, file: this.text(input, 'msg_image', 'file') ?? null,
      } });
      await tx.hr_ta3mem_personal_msg_details.createMany({ data: users.map((recipient) => ({
        ta3mem_msg_id_fk: header.id, to_user_id: recipient.user_id,
        to_emp_id: recipient.emp_code, seen: 0, send_date: now.date,
        send_time: now.time, for_month: now.month, for_year: now.year,
      })) });
      return header;
    });
    return { msg_id: String(row.id) };
  }

  async inbox(user: JwtUser, input: LegacyInput) {
    const { perPage, skip } = this.paging(input);
    const seenText = this.text(input, 'seen');
    const seen = seenText == null ? undefined : Number(seenText);
    const details = await this.prisma.hr_ta3mem_personal_msg_details.findMany({
      where: { to_user_id: user.sub, deleted: 0,
        ...(Number.isInteger(seen) ? { seen } : {}) },
      orderBy: { id: 'desc' }, skip, take: perPage,
    });
    return this.messageRows(details.map((row) => row.ta3mem_msg_id_fk).filter((id): id is number => id != null), details);
  }

  async sent(user: JwtUser, input: LegacyInput) {
    const { perPage, skip } = this.paging(input);
    const rows = await this.prisma.hr_ta3mem_personal_msg.findMany({
      where: { from_user_id: user.sub, deleted: 0 }, orderBy: { id: 'desc' }, skip, take: perPage,
    });
    const details = rows.length ? await this.prisma.hr_ta3mem_personal_msg_details.findMany({
      where: { ta3mem_msg_id_fk: { in: rows.map((row) => row.id) } }, orderBy: { id: 'asc' },
    }) : [];
    const recipients = await this.recipientRows(details);
    return rows.map((row) => ({
      msg_id: String(row.id), msg_date: row.msg_date ?? '', msg_time: row.msg_time ?? '',
      subject: row.subject ?? '', message: row.message ?? '', file: row.file ?? '',
      to_users: recipients.get(row.id) ?? [],
    }));
  }

  async viewMessage(user: JwtUser, input: LegacyInput) {
    const id = this.positiveId(input, 'msg_id', 'id');
    const row = await this.prisma.hr_ta3mem_personal_msg.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الرسالة غير موجودة');
    const recipient = await this.prisma.hr_ta3mem_personal_msg_details.findFirst({
      where: { ta3mem_msg_id_fk: id, to_user_id: user.sub },
    });
    if (row.from_user_id !== user.sub && !recipient) throw new ForbiddenException('الرسالة غير موجهة إليك');
    const details = await this.prisma.hr_ta3mem_personal_msg_details.findMany({
      where: { ta3mem_msg_id_fk: id }, orderBy: { id: 'asc' },
    });
    const recipients = await this.recipientRows(details);
    return [{ msg_id: String(row.id), msg_date: row.msg_date ?? '', msg_time: row.msg_time ?? '',
      subject: row.subject ?? '', message: row.message ?? '', file: row.file ?? '',
      to_users: recipients.get(row.id) ?? [] }];
  }

  async seenMessage(user: JwtUser, input: LegacyInput) {
    const id = this.positiveId(input, 'msg_id', 'id');
    const detail = await this.prisma.hr_ta3mem_personal_msg_details.findFirst({
      where: { ta3mem_msg_id_fk: id, to_user_id: user.sub },
    });
    if (!detail) throw new ForbiddenException('الرسالة غير موجهة إليك');
    const now = this.now();
    await this.prisma.hr_ta3mem_personal_msg_details.update({
      where: { id: detail.id }, data: { seen: 1, seen_date: now.date, seen_time: now.time },
    });
    return this.viewMessage(user, { msg_id: id });
  }

  async deleteMessage(user: JwtUser, input: LegacyInput) {
    const id = this.positiveId(input, 'msg_id', 'id');
    const row = await this.prisma.hr_ta3mem_personal_msg.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الرسالة غير موجودة');
    const now = this.now();
    if (row.from_user_id === user.sub) {
      await this.prisma.$transaction([
        this.prisma.hr_ta3mem_personal_msg.update({ where: { id }, data: { deleted: 1, deleted_date: now.date, deleted_time: now.time } }),
        this.prisma.hr_ta3mem_personal_msg_details.updateMany({ where: { ta3mem_msg_id_fk: id }, data: { deleted: 1, deleted_date: now.date, deleted_time: now.time } }),
      ]);
      return '';
    }
    const result = await this.prisma.hr_ta3mem_personal_msg_details.updateMany({
      where: { ta3mem_msg_id_fk: id, to_user_id: user.sub },
      data: { deleted: 1, deleted_date: now.date, deleted_time: now.time },
    });
    if (!result.count) throw new ForbiddenException('الرسالة غير موجهة إليك');
    return '';
  }

  private async messageRows(ids: number[], details: Array<{ ta3mem_msg_id_fk: number | null; seen: number | null; seen_date: string | null; seen_time: string | null; id: number }>) {
    const rows = ids.length ? await this.prisma.hr_ta3mem_personal_msg.findMany({ where: { id: { in: ids }, deleted: 0 } }) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const senderIds = [...new Set(rows.map((row) => row.from_emp_id).filter((id): id is number => id != null))];
    const employees = senderIds.length ? await this.prisma.employees.findMany({
      where: { id: { in: senderIds } },
      select: APP_EMPLOYEE_SELECT,
    }) : [];
    const byEmployee = new Map(employees.map((row) => [row.id, row]));
    return details.flatMap((detail) => {
      const row = detail.ta3mem_msg_id_fk ? byId.get(detail.ta3mem_msg_id_fk) : null;
      if (!row) return [];
      const from = row.from_emp_id ? byEmployee.get(row.from_emp_id) : null;
      return [{ msg_id: String(row.id), msg_date: row.msg_date ?? '', msg_time: row.msg_time ?? '',
        subject: row.subject ?? '', message: row.message ?? '', file: row.file ?? '',
        detail_id: String(detail.id), seen: String(detail.seen ?? 0),
        seen_date: detail.seen_date ?? '', seen_time: detail.seen_time ?? '',
        from_employee_name: from?.employee ?? '', from_employee_edara_name: from?.edara_n ?? '',
        from_employee_qsm_name: from?.qsm_n ?? '', from_employee_mosma_wazefy_name: from?.mosma_wazefy_n ?? '',
        from_emp_img: from?.personal_photo
          ? `/uploads/human_resources/emp_photo/thumbs/${from.personal_photo}`
          : '/asisst/admin_asset/img/avatar5.png' }];
    });
  }

  private async recipientRows(details: Array<{ ta3mem_msg_id_fk: number | null; to_emp_id: number | null; to_user_id: number | null; seen: number | null; seen_date: string | null; seen_time: string | null; id: number }>) {
    const empIds = [...new Set(details.map((row) => row.to_emp_id).filter((id): id is number => id != null))];
    const employees = empIds.length ? await this.prisma.employees.findMany({
      where: { id: { in: empIds } },
      select: APP_EMPLOYEE_SELECT,
    }) : [];
    const byEmployee = new Map(employees.map((row) => [row.id, row]));
    const result = new Map<number, unknown[]>();
    for (const detail of details) {
      if (detail.ta3mem_msg_id_fk == null) continue;
      const emp = detail.to_emp_id ? byEmployee.get(detail.to_emp_id) : null;
      const list = result.get(detail.ta3mem_msg_id_fk) ?? [];
      list.push({ detail_id: String(detail.id), to_user_id: String(detail.to_user_id ?? ''),
        seen: String(detail.seen ?? 0), seen_date: detail.seen_date ?? '', seen_time: detail.seen_time ?? '',
        to_employee_name: emp?.employee ?? '', to_employee_edara_name: emp?.edara_n ?? '',
        to_employee_qsm_name: emp?.qsm_n ?? '', to_employee_mosma_wazefy_name: emp?.mosma_wazefy_n ?? '',
        to_emp_img: emp?.personal_photo
          ? `/uploads/human_resources/emp_photo/thumbs/${emp.personal_photo}`
          : '/asisst/admin_asset/img/avatar5.png' });
      result.set(detail.ta3mem_msg_id_fk, list);
    }
    return result;
  }

  async laws(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const rows = await this.prisma.hr_lawyeh_files.findMany({ orderBy: { id: 'desc' }, skip, take: perPage });
    const seen = rows.length ? await this.prisma.hr_lawyeh_files_seens.findMany({
      where: { emp_id_fk: emp.id, layha_id_fk: { in: rows.map((row) => row.id) } },
    }) : [];
    const seenById = new Map(seen.map((row) => [row.layha_id_fk, row]));
    return rows.map((row) => {
      const state = seenById.get(row.id);
      return { layha_id: String(row.id), layha_name: row.title ?? '', details: row.details ?? '', layha_path: row.f_file ?? '',
        seen: String(state?.seen ?? 0), seen_date: state?.seen_date ?? '', seen_time: state?.seen_time ?? '' };
    });
  }

  async seenLaw(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'layha_id', 'layha_id_fk', 'id');
    const law = await this.prisma.hr_lawyeh_files.findUnique({ where: { id } });
    if (!law) throw new NotFoundException('اللائحة غير موجودة');
    const now = this.now();
    const existing = await this.prisma.hr_lawyeh_files_seens.findFirst({ where: { layha_id_fk: id, emp_id_fk: emp.id } });
    if (existing) await this.prisma.hr_lawyeh_files_seens.update({ where: { id: existing.id }, data: { seen: 1, seen_date: now.date, seen_time: now.time, user_id_fk: user.sub } });
    else await this.prisma.hr_lawyeh_files_seens.create({ data: { layha_id_fk: id, emp_id_fk: emp.id, user_id_fk: user.sub, seen: 1, seen_date: now.date, seen_time: now.time } });
    return { layha_id: String(id), seen: '1' };
  }

  async months() {
    const month = new Date().getMonth() + 1;
    const names = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    return [{ month_id: String(month), month_name: names[month - 1] }];
  }

  async permissionDetail(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'ezn_id', 'id');
    const row = await this.prisma.hr_all_ozonat_orders.findFirst({
      where: { id, OR: [{ emp_id_fk: emp.id }, { current_to_user_id: user.sub }] },
    });
    if (!row) throw new NotFoundException('طلب الإذن غير موجود');
    return [row];
  }

  async editPermission(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'ezn_id', 'id');
    const row = await this.prisma.hr_all_ozonat_orders.findFirst({ where: { id, emp_id_fk: emp.id } });
    if (!row || (row.suspend ?? 0) > 1) throw new BadRequestException('لا يمكن تعديل طلب الإذن');
    const from = this.text(input, 'from_time', 'fromHour');
    const to = this.text(input, 'to_time', 'toHour');
    if (!from || !to) throw new BadRequestException('وقت بداية ونهاية الإذن مطلوبان');
    const minutes = this.minutesBetween(from, to);
    await this.prisma.hr_all_ozonat_orders.update({ where: { id }, data: {
      no3_ezn: this.positiveId(input, 'ezn_type_id', 'no3Ezn'), from_hour: from,
      to_hour: to, total_hours: minutes, reason: this.text(input, 'reason') ?? null,
    } });
    return { ezn_id: String(id) };
  }

  async deletePermission(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'ezn_id', 'id');
    const result = await this.prisma.hr_all_ozonat_orders.deleteMany({
      where: { id, emp_id_fk: emp.id, suspend: { lte: 1 } },
    });
    if (!result.count) throw new BadRequestException('لا يمكن حذف طلب الإذن');
    return '';
  }

  async editLeave(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'agaza_id', 'id');
    const row = await this.prisma.hr_all_agzat_orders.findFirst({ where: { id, emp_id_fk: emp.id } });
    if (!row || (row.suspend ?? 0) > 1) throw new BadRequestException('لا يمكن تعديل طلب الإجازة');
    const from = this.text(input, 'from_date', 'startDate');
    const to = this.text(input, 'to_date', 'endDate');
    if (!from || !to) throw new BadRequestException('تاريخ بداية ونهاية الإجازة مطلوبان');
    const fromDate = new Date(`${from}T12:00:00`);
    const toDate = new Date(`${to}T12:00:00`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
      throw new BadRequestException('تواريخ الإجازة غير صحيحة');
    }
    const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    const resume = new Date(toDate.getTime() + 86_400_000).toISOString().slice(0, 10);
    await this.prisma.hr_all_agzat_orders.update({ where: { id }, data: {
      no3_agaza: this.positiveId(input, 'no3_agaza_id', 'leaveTypeId'),
      agaza_from_date_m: from, agaza_to_date_m: to, num_days: days,
      mobashret_amal_date_m: resume, reason: this.text(input, 'reason') ?? null,
      marad_name: this.text(input, 'marad_name') ?? null,
      hospital_name: this.text(input, 'hospital_name') ?? null,
      hospital_report: this.text(input, 'hospital_report', 'f_file') ?? row.hospital_report,
    } });
    return { agaza_id: String(id) };
  }

  private minutesBetween(from: string, to: string) {
    const parse = (value: string) => {
      const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?/);
      if (!match) throw new BadRequestException('صيغة الوقت غير صحيحة');
      let hour = Number(match[1]);
      if (match[3]) {
        hour %= 12;
        if (match[3].toLowerCase() === 'pm') hour += 12;
      }
      return hour * 60 + Number(match[2]);
    };
    const value = Math.abs(parse(to) - parse(from));
    if (!value) throw new BadRequestException('مدة الإذن غير صحيحة');
    return value;
  }

  async correspondence(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const rows = await this.prisma.hr_mosalat.findMany({ where: { emp_name_id: emp.id }, orderBy: { id: 'desc' }, skip, take: perPage });
    const items = rows.length ? await this.prisma.hr_mosalat_mokalfat.findMany({ where: { mosala_id_fk: { in: rows.map((row) => row.id) } } }) : [];
    return rows.map((row) => ({ mosala_id: String(row.id), mosala_date_ar: row.mosala_date_ar ?? '',
      emp_name: row.emp_name ?? '', send_to_hr: row.send_to_hr,
      answer_reasons: row.answer_reasons ?? '', answer_mobarer: row.answer_mobarer ?? '',
      answer_other: row.answer_other ?? '', f_file: row.f_file ?? '', details: row.details ?? '',
      mosala_file: row.f_file ? `/uploads/human_resources/mosalat/${row.f_file}` : 'null',
      num_mokalfat: items.filter((item) => item.mosala_id_fk === row.id).length,
      have_egraa: row.send_to_hr === 'yes' ? 'no' : 'yes',
      mokalfat_list: items.filter((item) => item.mosala_id_fk === row.id).map((item) => ({
        id: String(item.id), mosala_id_fk: String(item.mosala_id_fk ?? ''),
        mokalfa_id: String(item.mokalfa_id ?? ''), mokalfa_name: item.mokalfa_name ?? '',
        mokalfa_notes: item.mokalfa_notes ?? '',
      })) }));
  }

  async answerCorrespondence(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'mosala_id', 'id');
    const row = await this.prisma.hr_mosalat.findFirst({ where: { id, emp_name_id: emp.id } });
    if (!row) throw new NotFoundException('المراسلة غير موجودة');
    if (row.send_to_hr === 'yes') throw new BadRequestException('تم إرسال الرد من قبل');
    const now = this.now();
    await this.prisma.hr_mosalat.update({ where: { id }, data: {
      answer_reasons: this.text(input, 'answer_reasons') ?? null,
      answer_mobarer: this.text(input, 'answer_mobarer') ?? null,
      answer_other: this.text(input, 'answer_other') ?? null,
      answer_date: now.date, answer_time: now.time, send_to_hr: 'yes',
    } });
    return '';
  }

  async ranges() {
    return this.prisma.hr_ntaqat_types.findMany({ orderBy: { id: 'asc' } });
  }

  async employeeRange(user: JwtUser) {
    const emp = await this.employee(user);
    const points = emp.neqat_total ?? 0;
    const ranges = await this.prisma.hr_ntaqat_types.findMany({ orderBy: { id: 'asc' } });
    const range = ranges[Math.max(0, Math.min(ranges.length - 1, Math.floor(points / 1000)))] ?? null;
    return { point: points, netaq_stars: 0, title: 'رصيد النقاط لديك',
      netaq_type: range?.title ?? '', netaq_color: range?.color ?? '', netaq_msg: range?.msg ?? '',
      netaq_color_1: range?.color_1 ?? '', netaq_color_2: range?.color_2 ?? '', netaq_color_3: range?.color_3 ?? '',
      font_color: '#ffffff', netaq_img: '/uploads/cup/ccup.png' };
  }

  async requestTypes() {
    return this.prisma.hr_talabat_types.findMany({ orderBy: { id: 'asc' } });
  }

  async statistics() {
    return this.prisma.hr_ehsayat.findMany({ orderBy: { id: 'asc' } });
  }

  async addRequest(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const typeId = this.positiveId(input, 'talab_type_id', 'no3_talab_id');
    const pending = await this.prisma.hr_talabat_orders.count({ where: { emp_id_fk: emp.id, suspend: 0 } });
    if (pending) throw new BadRequestException('لديك طلب قيد المراجعة في الوقت الحالي');
    const now = this.now();
    const row = await this.prisma.hr_talabat_orders.create({ data: {
      talab_date_ar: now.date, talab_time: now.time, emp_id_fk: emp.id,
      no3_talab_id: typeId, notes: this.text(input, 'notes') ?? null,
      date_ar: now.date, for_month: now.month, for_year: now.year, suspend: 0,
    } });
    return { order_id: String(row.id) };
  }

  async requests(user: JwtUser, input: LegacyInput, one = false) {
    const emp = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const status = this.text(input, 'status');
    const id = one ? this.positiveId(input, 'order_id', 'id') : undefined;
    const rows = await this.prisma.hr_talabat_orders.findMany({ where: {
      emp_id_fk: emp.id, ...(id ? { id } : {}),
      ...(status === 'gari' ? { suspend: 0 } : status === 'accepted' ? { suspend: { gte: 2 } } : {}),
    }, orderBy: { id: 'desc' }, ...(one ? {} : { skip, take: perPage }) });
    const types = await this.prisma.hr_talabat_types.findMany({ where: { id: { in: rows.map((row) => row.no3_talab_id).filter((v): v is number => v != null) } } });
    const byType = new Map(types.map((row) => [row.id, row.title]));
    return rows.map((row) => ({ id: String(row.id), emp_name: emp.employee ?? '',
      talab_date_ar: row.talab_date_ar ?? '', talab_time: row.talab_time ?? '',
      emp_id_fk: String(row.emp_id_fk ?? ''), suspend: String(row.suspend ?? 0),
      notes: row.notes ?? '', rad_notes: row.rad_notes ?? '', no3_talab_name: byType.get(row.no3_talab_id ?? -1) ?? '',
      halet_talab: this.statusName(row.suspend), edit_delete: row.suspend === 0 ? 'yes' : 'no',
      rad_file: row.rad_file ?? '/uploads/talabat_orders/talab.pdf' }));
  }

  async deleteRequest(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'order_id', 'id');
    const result = await this.prisma.hr_talabat_orders.deleteMany({ where: { id, emp_id_fk: emp.id, suspend: 0 } });
    if (!result.count) throw new BadRequestException('لا يمكن حذف الطلب');
    return '';
  }

  async addInitiative(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const title = this.text(input, 'title');
    const notes = this.text(input, 'notes');
    if (!title || !notes) throw new BadRequestException('عنوان ووصف المبادرة مطلوبان');
    const now = this.now();
    const row = await this.prisma.hr_mobadrat.create({ data: { emp_id_fk: emp.id, title, notes,
      send_date_ar: now.date, send_time: now.time, for_month: now.month, for_year: now.year, suspend: 0 } });
    return { mobadra_id: String(row.id) };
  }

  async initiatives(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const status = this.text(input, 'status');
    const rows = await this.prisma.hr_mobadrat.findMany({ where: { emp_id_fk: emp.id,
      ...(status === 'gari' ? { suspend: 0 } : status === 'accepted' ? { suspend: { gte: 2 } } : {}) },
      orderBy: { id: 'desc' }, skip, take: perPage });
    return rows.map((row) => ({ ...row, id: String(row.id), emp_name: emp.employee ?? '',
      suspend: String(row.suspend ?? 0), halet_talab: this.statusName(row.suspend),
      edit_delete: row.suspend === 0 ? 'yes' : 'no' }));
  }

  async deleteInitiative(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'mobadra_id', 'id');
    const result = await this.prisma.hr_mobadrat.deleteMany({ where: { id, emp_id_fk: emp.id, suspend: 0 } });
    if (!result.count) throw new BadRequestException('لا يمكن حذف المبادرة');
    return '';
  }

  async activities(user: JwtUser, input: LegacyInput) {
    return this.activityRequests(user, input, 'sent');
  }

  /** Employee-created activity requests vs activities assigned from the HR system. */
  async activityRequests(user: JwtUser, input: LegacyInput, mode: 'sent' | 'incoming') {
    const emp = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const where = mode === 'sent'
      ? { emp_id: emp.id, source: 'mobile', created_by_user_id: user.sub }
      : { emp_id: emp.id, source: 'system' };
    const rows = await this.prisma.hr_ansheta.findMany({ where, orderBy: { id: 'desc' }, skip, take: perPage });
    const files = rows.length ? await this.prisma.hr_ansheta_files.findMany({ where: { main_id_fk: { in: rows.map((row) => row.id) } } }) : [];
    return rows.map((row) => ({ ...row, id: String(row.id), emp_name: emp.employee ?? '',
      suspend: String(row.suspend), halet_talab: this.statusName(row.suspend),
      edit_delete: row.suspend === 0 ? 'yes' : 'no',
      all_images: files.filter((file) => file.main_id_fk === row.id).map((file) => ({ ...file, id: String(file.id) })) }));
  }

  async addActivity(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const title = this.text(input, 'title');
    if (!title) throw new BadRequestException('العنوان مطلوب');
    const fileNames = Array.isArray(input.files) ? input.files.map(String) : this.text(input, 'file_name', 'files')?.split(',').filter(Boolean) ?? [];
    const now = this.now();
    const row = await this.prisma.$transaction(async (tx) => {
      const activity = await tx.hr_ansheta.create({ data: { emp_id: emp.id, title,
        notes: this.text(input, 'notes') ?? null, send_date: now.date, send_time: now.time, suspend: 0,
        source: 'mobile', created_by_user_id: user.sub } });
      if (fileNames.length) {
        await tx.hr_ansheta_files.createMany({ data: fileNames.map((file_name) => ({ main_id_fk: activity.id, file_name, uploaded_on: now.date })) });
      }
      return activity;
    });
    return { main_id: String(row.id) };
  }

  async deleteActivity(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'main_id', 'id');
    const row = await this.prisma.hr_ansheta.findFirst({ where: { id, emp_id: emp.id, suspend: 0 } });
    if (!row) throw new BadRequestException('لا يمكن حذف النشاط');
    await this.prisma.$transaction([
      this.prisma.hr_ansheta_files.deleteMany({ where: { main_id_fk: id } }),
      this.prisma.hr_ansheta.delete({ where: { id } }),
    ]);
    return '';
  }

  async addLocation(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const lat = Number(this.text(input, 'lat', 'site_lat'));
    const long = Number(this.text(input, 'long', 'lng', 'site_long'));
    const siteId = this.positiveId(input, 'site_id');
    if (!Number.isFinite(lat) || !Number.isFinite(long)) throw new BadRequestException('إحداثيات الموقع غير صحيحة');
    const now = this.now();
    const row = await this.prisma.tbl_emp_zeyarat.create({ data: { emp_id: emp.id,
      emp_code: emp.emp_code ?? emp.id, emp_name: emp.employee, site_lat: lat, site_long: long,
      date: now.date, zeyara_date: now.date, zeyara_time: now.time,
      emp_img: this.text(input, 'emp_img', 'zeyara_img') ?? '', site_id: siteId,
      site_name: this.text(input, 'site_name') ?? null, notes: this.text(input, 'notes') ?? null } });
    return { zeyara_id: String(row.id) };
  }

  async locations(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const rows = await this.prisma.tbl_emp_zeyarat.findMany({ where: { emp_id: emp.id }, orderBy: { id: 'desc' }, skip, take: perPage });
    return rows.map((row) => ({ ...row, id: String(row.id), emp_code: String(row.emp_code), site_id: String(row.site_id) }));
  }

  async deleteLocation(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const id = this.positiveId(input, 'zeyara_id', 'id');
    const result = await this.prisma.tbl_emp_zeyarat.deleteMany({ where: { id, emp_id: emp.id } });
    if (!result.count) throw new NotFoundException('الزيارة غير موجودة');
    return '';
  }

  async overtime(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const dateFrom = this.text(input, 'dateFrom', 'date_from');
    const dateTo = this.text(input, 'dateTo', 'date_to');
    const search = this.text(input, 'search');
    const numericSearch = search != null ? Number(search) : NaN;
    return this.prisma.tbl_emps_hours_edafi.findMany({
      where: {
        emp_id_fk: emp.id,
        ...(dateFrom && dateTo ? { edafa_date: { gte: dateFrom.slice(0, 10), lte: dateTo.slice(0, 10) } } : {}),
        ...(search ? {
          OR: [
            { edafa_date: { contains: search } }, { date_ar: { contains: search } },
            { date_s: { contains: search } }, { emp_name: { contains: search } },
            ...(Number.isInteger(numericSearch) ? [{ num_hours: numericSearch }] : []),
          ],
        } : {}),
      },
      orderBy: { id: 'desc' }, skip, take: perPage,
    });
  }

  async shiftChanges(user: JwtUser, input: LegacyInput) {
    const emp = await this.employee(user);
    const { perPage, skip } = this.paging(input);
    const dateFrom = this.text(input, 'dateFrom', 'date_from');
    const dateTo = this.text(input, 'dateTo', 'date_to');
    const search = this.text(input, 'search');
    const numericSearch = search != null ? Number(search) : NaN;
    return this.prisma.tbl_emps_shef_edafi.findMany({
      where: {
        emp_id_fk: emp.id,
        ...(dateFrom && dateTo ? { sheft_date: { gte: dateFrom.slice(0, 10), lte: dateTo.slice(0, 10) } } : {}),
        ...(search ? {
          OR: [
            { sheft_date: { contains: search } }, { date_ar: { contains: search } },
            { date_s: { contains: search } }, { emp_name: { contains: search } },
            ...(Number.isInteger(numericSearch) ? [{ ttype: numericSearch }, { dwam_id_fk: numericSearch }] : []),
          ],
        } : {}),
      },
      orderBy: { id: 'desc' }, skip, take: perPage,
    });
  }

  async slides() {
    const rows = await this.prisma.tbl_sliders.findMany({ orderBy: { id: 'desc' } });
    return rows.map((row) => ({ ...row, id: String(row.id), image_path: row.main_image ?? '' }));
  }

  async splashScreens() {
    const rows = await this.prisma.tbl_spalsh.findMany({ orderBy: [{ screen_number: 'asc' }, { spalsh_id: 'asc' }] });
    return rows.map((row) => ({ ...row, spalsh_id: String(row.spalsh_id),
      screen_number: String(row.screen_number ?? ''),
      image_path: row.image ? `/uploads/splash/${row.image}` : '' }));
  }

  private statusName(status: number | null) {
    if (status == null || status === 0) return 'قيد الانتظار';
    if (status >= 2 && status < 5) return 'مقبول';
    if (status >= 5) return 'مرفوض';
    return 'قيد المراجعة';
  }
}
