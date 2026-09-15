import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService, LoginResult, StaffLoginResult } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateVisitDto, MobileDailyTaskDto, MobileListDto, MobileMonthlyStatisticsDto } from './dto/mobile.dto';

/**
 * Mobile API foundation — employee-facing slice of the legacy Api.php controller.
 * Self-contained: data via PrismaService, auth/token issuance delegated to AuthService.
 * Each mutating helper resolves the caller's employee row from JwtUser.emp_code
 * (users.emp_code === employees.id, the legacy foreign-key convention).
 */
@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Authenticate the standalone employee app without falling back to club-member login.
  * A valid mobile session must belong to an approved user linked to an existing employee.
  */
  async login(username: string, password: string): Promise<LoginResult> {
    const normalizedUsername = username.trim();
    const account = await this.prisma.users.findFirst({
      where: { username: normalizedUsername, approved: 1 },
      select: { user_id: true },
    });
    if (!account) throw new UnauthorizedException('رقم الهاتف غير صحيح');

    let result: StaffLoginResult;
    try {
      result = await this.auth.authenticateStaff(normalizedUsername, password);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException('كلمة المرور غير صحيحة');
      }
      throw error;
    }
    const employeeId = result.user.emp_code;
    if (employeeId == null) throw new UnauthorizedException('الحساب غير مرتبط بموظف');

    const employee = await this.prisma.employees.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) throw new UnauthorizedException('الموظف غير موجود');

    return { ...result, accountType: 'staff', mustChangePassword: false };
  }

  /** Resolves the manager-entered phone number without exposing an employee directory to the client. */
  async employeeIdByPhone(phone: string) {
    const normalized = phone.trim();
    const employee = await this.prisma.employees.findFirst({
      where: { phone: normalized },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('رقم هاتف الموظف غير موجود');
    return employee.id;
  }

  /**
   * Compatibility adapter for Api.php::login_app. The old app posted phone/user_pass;
   * authentication still goes through AuthService so legacy hashes are upgraded and
   * the caller receives the same signed JWT used by every protected endpoint.
   */
  async legacyLogin(phoneOrUsername: string, password: string) {
    const value = phoneOrUsername.trim();
    const employee = await this.prisma.employees.findFirst({
      where: { OR: [{ phone: value }, { emp_code: /^\d+$/.test(value) ? Number(value) : -1 }] },
      // Some legacy rows contain values outside Prisma's YesNo enum. Selecting only
      // login/profile fields prevents unrelated dirty columns from breaking login.
      select: {
        id: true,
        emp_code: true,
        card_num: true,
        employee: true,
        edara_n: true,
        qsm_n: true,
        mosma_wazefy_n: true,
        phone: true,
      },
    });
    const account = employee
      ? await this.prisma.users.findFirst({ where: { emp_code: employee.id, approved: 1 } })
      : await this.prisma.users.findFirst({ where: { username: value, approved: 1 } });
    if (!account?.username) throw new ForbiddenException('رقم الجوال غير موجود');

    const result = await this.auth.login(account.username, password);
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      logout_option: 1,
      user_id: String(account.user_id),
      emp_id: employee ? String(employee.id) : null,
      emp_code: employee?.emp_code != null ? String(employee.emp_code) : null,
      card_num: employee?.card_num != null ? String(employee.card_num) : null,
      employee: employee?.employee ?? result.user.name ?? '',
      edara_name: employee?.edara_n ?? null,
      qsm_name: employee?.qsm_n ?? null,
      mosma_wazefy_name: employee?.mosma_wazefy_n ?? null,
      phone_number: employee?.phone ?? null,
    };
  }

  /** Safe employee profile for the logged-in user (name, code, branch, job, photo). */
  async profile(user: JwtUser) {
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub } });
    if (!account) throw new NotFoundException('المستخدم غير موجود');

    const employeeId = account.emp_code ?? user.emp_code;
    const emp =
      employeeId != null
        ? await this.prisma.employees.findUnique({
            where: { id: employeeId },
            // Imported legacy rows can contain values outside Prisma enums in
            // unrelated columns. Keep mobile reads restricted to fields used here.
            select: {
              id: true,
              emp_code: true,
              card_num: true,
              employee: true,
              edara_n: true,
              qsm_n: true,
              mosma_wazefy_n: true,
              phone: true,
              personal_photo: true,
              users_signatures: true,
              barcode_path: true,
              qrcode_path: true,
              email: true,
            },
          })
        : null;

    return {
      user_id: String(account.user_id),
      emp_id: emp ? String(emp.id) : '',
      emp_code: emp?.emp_code == null ? '' : String(emp.emp_code),
      card_num: emp?.card_num == null ? '' : String(emp.card_num),
      employee: emp?.employee ?? account.name ?? '',
      edara_name: emp?.edara_n ?? '',
      qsm_name: emp?.qsm_n ?? '',
      mosma_wazefy_name: emp?.mosma_wazefy_n ?? '',
      phone_number: emp?.phone ?? '',
      personal_photo: emp?.personal_photo ?? '',
      emp_img: emp?.personal_photo
        ? `/uploads/human_resources/emp_photo/thumbs/${emp.personal_photo}`
        : '/asisst/admin_asset/img/avatar5.png',
      users_signatures: emp?.users_signatures ?? '',
      emp_signature: emp?.users_signatures
        ? `/uploads/emp_signatures/${emp.users_signatures}`
        : '/asisst/admin_asset/img/avatar5.png',
      barcode_path: emp?.barcode_path ?? '',
      qrcode_path: emp?.qrcode_path ?? '',
      email: emp?.email ?? account.email ?? null,
      send_msg: 'no', add_agaza: 'yes', add_ezn: 'yes', add_mobadra: 'yes',
      add_edary: 'yes', add_nashat: 'yes', show_netaq: 'yes',
      show_alert_screen: 'yes', with_ads: 'yes', show_main_ehsay: 'no',
      show_zeyara: 'no', add_zeyara: 'yes',
    };
  }

  /** Persist the FCM/device token on the user row (legacy update_token). */
  async setDeviceToken(user: JwtUser, token: string) {
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub } });
    if (!account) throw new NotFoundException('المستخدم غير موجود');
    await this.prisma.users.update({
      where: { user_id: user.sub },
      data: { device_token: token },
    });
    return { ok: true };
  }

  /** Latest 50 notifications delivered to the current user. */
  async notifications(user: JwtUser) {
    const rows = await this.prisma.tbl_notifications.findMany({
      where: { to_user: user.sub },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const data = rows.map((n) => ({
      id: n.id,
      fromUser: n.from_user,
      date: n.date_ar,
      time: n.time_ar,
      seen: n.seen === 1,
      seenDate: n.seen_date,
      code: n.n_code,
      notifyId: n.notify_id_fk,
      targetId: n.fk_id != null ? Number(n.fk_id) : null,
    }));
    return data;
  }

  /** Mark one of the current user's notifications as seen (legacy seen flag + seen_date/time). */
  async markNotificationRead(user: JwtUser, id: number) {
    const notif = await this.prisma.tbl_notifications.findUnique({ where: { id } });
    if (!notif) throw new NotFoundException('الإشعار غير موجود');
    if (notif.to_user !== user.sub) throw new ForbiddenException('غير مصرح');

    const now = new Date();
    await this.prisma.tbl_notifications.update({
      where: { id },
      data: {
        seen: 1,
        seen_date: now.toISOString().slice(0, 10),
        seen_time: now.toTimeString().slice(0, 5),
      },
    });
    return { id, seen: true };
  }

  /** The current employee's leave orders (hr_all_agzat_orders, matched on the business code). */
  async leaves(user: JwtUser) {
    const emp = await this.currentEmployee(user);
    if (emp.emp_code == null) return { data: [] };
    const rows = await this.prisma.hr_all_agzat_orders.findMany({
      where: { emp_code_fk: BigInt(emp.emp_code) },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const data = rows.map((r) => ({
      id: r.id,
      requestNo: r.agaza_rkm,
      leaveTypeId: r.no3_agaza,
      fromDate: r.agaza_from_date_m,
      toDate: r.agaza_to_date_m,
      days: r.num_days,
      reason: r.reason,
      suspend: r.suspend,
      status: r.actions_sends,
      createdAt: r.agaza_date_ar,
    }));
    return { data };
  }

  async leave(user: JwtUser, id: number) {
    const emp = await this.currentEmployee(user);
    const row = await this.prisma.hr_all_agzat_orders.findFirst({
      where: { id, emp_id_fk: emp.id },
    });
    if (!row) throw new NotFoundException('طلب الإجازة غير موجود');
    return row;
  }

  /** Legacy Add_Task/Get_Tasks_List use hr_dialy_reports, not the web hr_mosalat task table. */
  async dailyTasks(user: JwtUser, query: MobileListDto) {
    const emp = await this.currentEmployee(user);
    const take = Math.min(query.perPage, 100);
    const where = {
      emp_id_fk: emp.id,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.hr_dialy_reports.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * take,
        take,
      }),
      this.prisma.hr_dialy_reports.count({ where }),
    ]);
    return { data: rows, total, page: query.page, perPage: take };
  }

  async createDailyTask(user: JwtUser, dto: MobileDailyTaskDto) {
    const emp = await this.currentEmployee(user);
    const now = new Date();
    const row = await this.prisma.hr_dialy_reports.create({
      data: {
        emp_id_fk: emp.id,
        title: dto.title,
        notes: dto.notes,
        status: dto.status,
        send_date_ar: now.toISOString().slice(0, 10),
        send_time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        for_month: now.getMonth() + 1,
        for_year: now.getFullYear(),
      },
    });
    return { id: row.id };
  }

  async deleteDailyTask(user: JwtUser, id: number) {
    const emp = await this.currentEmployee(user);
    const row = await this.prisma.hr_dialy_reports.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('المهمة غير موجودة');
    if (row.emp_id_fk !== emp.id) throw new ForbiddenException('غير مصرح');
    await this.prisma.hr_dialy_reports.delete({ where: { id } });
    return { id };
  }

  async circulars(user: JwtUser, query: MobileListDto) {
    const emp = await this.currentEmployee(user);
    const take = Math.min(query.perPage, 100);
    // General circulars are visible to every employee even before the first
    // open creates a per-employee detail/read row. Direct circulars remain
    // visible only when an explicit recipient record exists.
    const [general, details] = await Promise.all([
      this.prisma.hr_ta3mem.findMany({ where: { send_all_t3mem: 1 }, orderBy: { id: 'desc' } }),
      this.prisma.hr_ta3mem_details.findMany({ where: { emp_id: emp.id }, orderBy: { id: 'desc' } }),
    ]);
    const directIds = details
      .map((row) => row.ta3mem_id_fk)
      .filter((id): id is number => id != null);
    const direct = directIds.length
      ? await this.prisma.hr_ta3mem.findMany({ where: { id: { in: directIds } } })
      : [];
    const detailsByCircularId = new Map(details
      .filter((detail): detail is typeof detail & { ta3mem_id_fk: number } => detail.ta3mem_id_fk != null)
      .map((detail) => [detail.ta3mem_id_fk, detail]));
    const byId = new Map([...general, ...direct].map((row) => [row.id, row]));
    const circulars = [...byId.values()].sort((a, b) => b.id - a.id);
    const paged = circulars.slice((query.page - 1) * take, query.page * take);
    return {
      data: paged.map((circular) => {
        const detail = detailsByCircularId.get(circular.id);
        return { id: circular.id, title: circular.ta3mem_title, subject: circular.subject,
          date: circular.ta3mem_date, image: circular.img, seen: detail?.seen === 1,
          detail_id: String(detail?.id ?? ''), ta3mem_id_fk: String(circular.id),
          emp_id: String(detail?.emp_id ?? emp.id), emp_code: String(detail?.emp_code ?? emp.emp_code ?? ''),
          emp_name: String(detail?.emp_name ?? ''), ta3mem_title: String(circular.ta3mem_title ?? ''),
          ta3mem_date: String(circular.ta3mem_date ?? ''), ta3mem_img: String(circular.img ?? ''),
          seen_value: String(detail?.seen ?? 0), seen_date: String(detail?.seen_date ?? ''),
          seen_time: String(detail?.seen_time ?? '') };
      }),
      total: circulars.length,
      page: query.page,
      perPage: take,
    };
  }

  async circular(user: JwtUser, id: number) {
    const emp = await this.currentEmployee(user);
    let detail = await this.prisma.hr_ta3mem_details.findFirst({
      where: { ta3mem_id_fk: id, emp_id: emp.id },
    });
    const circular = await this.prisma.hr_ta3mem.findUnique({ where: { id } });
    if (!circular) throw new NotFoundException('التعميم غير موجود');
    if (!detail) {
      if (circular.send_all_t3mem !== 1) throw new NotFoundException('التعميم غير موجه لهذا الموظف');
      detail = await this.prisma.hr_ta3mem_details.create({
        data: { ta3mem_id_fk: id, emp_id: emp.id, emp_code: emp.emp_code, emp_name: '', seen: 0 },
      });
    }
    const attachments = await this.prisma.hr_ta3mem_attaches.findMany({
      where: { ta3mem_id_fk: id },
      orderBy: { id: 'asc' },
    });
    return { id, title: circular.ta3mem_title, subject: circular.subject,
      date: circular.ta3mem_date, image: circular.img, seen: detail.seen === 1,
      detail_id: String(detail.id), ta3mem_id_fk: String(id),
      emp_id: String(detail.emp_id ?? ''), emp_code: String(detail.emp_code ?? ''),
      emp_name: String(detail.emp_name ?? ''), ta3mem_title: String(circular.ta3mem_title ?? ''),
      ta3mem_date: String(circular.ta3mem_date ?? ''), ta3mem_img: String(circular.img ?? ''),
      seen_value: String(detail.seen ?? 0), seen_date: String(detail.seen_date ?? ''),
      seen_time: String(detail.seen_time ?? ''),
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        title: attachment.title,
        file: attachment.file,
      })) };
  }

  async markCircularRead(user: JwtUser, id: number) {
    const emp = await this.currentEmployee(user);
    let detail = await this.prisma.hr_ta3mem_details.findFirst({ where: { ta3mem_id_fk: id, emp_id: emp.id } });
    if (!detail) {
      const circular = await this.prisma.hr_ta3mem.findUnique({ where: { id } });
      if (!circular) throw new NotFoundException('التعميم غير موجود');
      if (circular.send_all_t3mem !== 1) throw new NotFoundException('التعميم غير موجه لهذا الموظف');
      detail = await this.prisma.hr_ta3mem_details.create({
        data: { ta3mem_id_fk: id, emp_id: emp.id, emp_code: emp.emp_code, emp_name: '', seen: 0 },
      });
    }
    const now = new Date();
    await this.prisma.hr_ta3mem_details.update({
      where: { id: detail.id },
      data: { seen: 1, seen_date: now.toISOString().slice(0, 10),
        seen_time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) },
    });
    return { id, seen: true };
  }

  async warnings(user: JwtUser, query: MobileListDto) {
    const emp = await this.currentEmployee(user);
    const take = Math.min(query.perPage, 100);
    const where = { emp_name_id: emp.id };
    const [rows, total] = await Promise.all([
      this.prisma.hr_enzarat.findMany({ where, orderBy: { id: 'desc' },
        skip: (query.page - 1) * take, take }),
      this.prisma.hr_enzarat.count({ where }),
    ]);
    return { data: rows.map((row) => this.warningResponse(row)), total,
      page: query.page, perPage: take };
  }

  async warning(user: JwtUser, id: number) {
    const emp = await this.currentEmployee(user);
    const row = await this.prisma.hr_enzarat.findFirst({ where: { id, emp_name_id: emp.id } });
    if (!row) throw new NotFoundException('الإنذار غير موجه لهذا الموظف');
    const attachments = await this.prisma.hr_enzarat_files.findMany({
      where: { main_id_fk: id },
      orderBy: { id: 'asc' },
    });
    return {
      ...this.warningResponse(row),
      attachments: attachments.map((file) => ({ id: file.id, title: file.title, file: file.file })),
    };
  }

  async markWarningRead(user: JwtUser, id: number) {
    const emp = await this.currentEmployee(user);
    const row = await this.prisma.hr_enzarat.findFirst({ where: { id, emp_name_id: emp.id } });
    if (!row) throw new NotFoundException('الإنذار غير موجه لهذا الموظف');
    const now = new Date();
    await this.prisma.hr_enzarat.update({
      where: { id },
      data: { seen: 1, seen_date: now.toISOString().slice(0, 10),
        seen_time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) },
    });
    return { id, seen: true };
  }

  /** The current employee's generic HR requests (hr_requests). */
  async requests(user: JwtUser) {
    const emp = await this.currentEmployee(user);
    if (emp.emp_code == null) return { data: [] };
    const rows = await this.prisma.hr_requests.findMany({
      where: { emp_code_fk: emp.emp_code },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const data = rows.map((r) => ({
      id: r.id,
      type: r.type,
      requestNo: r.request_no,
      status: r.status,
      reasonAction: r.reason_action,
      createdAt: r.created_at,
    }));
    return { data };
  }

  /** Field-employee location punch (legacy Api.php send_visit). */
  async createVisit(user: JwtUser, dto: CreateVisitDto) {
    const emp = await this.currentEmployee(user);
    if (user.emp_code == null) throw new ForbiddenException('الحساب غير مرتبط بموظف');

    const now = new Date();
    const row = await this.prisma.hr_locations_visits.create({
      data: {
        emp_id_fk: emp.id,
        lat: dto.lat,
        long: dto.long,
        img_path: dto.img ?? undefined,
        notes: dto.notes ?? undefined,
        send_date_ar: now.toISOString().slice(0, 10),
        send_time: now.toTimeString().slice(0, 5),
      },
    });
    return { id: row.id };
  }

  /** Compact current-employee dashboard for one Gregorian month. */
  async monthlyStatistics(user: JwtUser, query: MobileMonthlyStatisticsDto) {
    const employee = await this.currentEmployee(user);
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    const [leavesCount, permissionsCount, attendance, loans, warningsCount] = await Promise.all([
      this.prisma.hr_all_agzat_orders.count({ where: { emp_id_fk: employee.id, month, year } }),
      this.prisma.hr_all_ozonat_orders.count({ where: { emp_id_fk: employee.id, ezn_month: month, ezn_year: year } }),
      this.prisma.tbl_hdoor_emps.findMany({
        where: { member_code: employee.emp_code ?? -1, for_month: month, for_year: year },
        select: { late_min: true, second_late_min: true },
      }),
      this.prisma.hr_solaf.aggregate({
        where: { emp_id_fk: employee.id, suspend: 4, t_rkm_date_m: { startsWith: monthPrefix } },
        _sum: { qemt_solaf: true },
      }),
      this.prisma.hr_enzarat.count({ where: { emp_name_id: employee.id, enzar_date_ar: { startsWith: monthPrefix } } }),
    ]);
    const lateMinutes = attendance.reduce(
      (total, row) => total + Math.max(0, Math.round(row.late_min ?? 0)) + Math.max(0, Math.round(row.second_late_min ?? 0)),
      0,
    );

    return {
      month,
      year,
      leavesCount,
      permissionsCount,
      lateCount: attendance.filter((row) => (row.late_min ?? 0) > 0 || (row.second_late_min ?? 0) > 0).length,
      lateMinutes,
      loansTotal: loans._sum.qemt_solaf ?? 0,
      warningsCount,
    };
  }

  private async currentEmployee(user: JwtUser) {
    if (user.emp_code == null) throw new ForbiddenException('الحساب غير مرتبط بموظف');
    const emp = await this.prisma.employees.findUnique({
      where: { id: user.emp_code },
      select: { id: true, emp_code: true },
    });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    return emp;
  }

  private warningResponse(row: {
    id: number;
    emp_name: string | null;
    emp_name_id: number | null;
    emp_edara: string | null;
    emp_edara_id: number | null;
    emp_qesm: string | null;
    emp_qesm_id: number | null;
    enzar_type: string | null;
    enzar_type_id: number | null;
    details: string | null;
    enzar_date_ar: string | null;
    enzar_time: string | null;
    hr_notes: string | null;
    seen: number;
  }) {
    return {
      id: row.id,
      type: row.enzar_type,
      details: row.details,
      date: row.enzar_date_ar,
      time: row.enzar_time,
      hrNotes: row.hr_notes,
      seen: row.seen === 1,
      // Backward-compatible legacy Api.php field names (legacy encoded every value as text).
      enzar_id_fk: String(row.id),
      emp_name: String(row.emp_name ?? ''),
      emp_name_id: String(row.emp_name_id ?? ''),
      emp_edara: String(row.emp_edara ?? ''),
      emp_edara_id: String(row.emp_edara_id ?? ''),
      emp_qesm: String(row.emp_qesm ?? ''),
      emp_qesm_id: String(row.emp_qesm_id ?? ''),
      enzar_type: String(row.enzar_type ?? ''),
      enzar_type_id: String(row.enzar_type_id ?? ''),
      enzar_date_ar: String(row.enzar_date_ar ?? ''),
      enzar_time: String(row.enzar_time ?? ''),
      hr_notes: String(row.hr_notes ?? ''),
      seen_value: String(row.seen),
    };
  }
}
