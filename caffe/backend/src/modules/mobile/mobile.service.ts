import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService, LoginResult } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateLeaveDto, CreateVisitDto } from './dto/mobile.dto';

/**
 * Mobile API foundation — employee-facing slice of the legacy Api.php controller.
 * Self-contained: data via PrismaService, auth/token issuance delegated to AuthService.
 * Each mutating helper resolves the caller's employee row from JwtUser.emp_code
 * (users.emp_code === employees.emp_code, the cross-table business key).
 */
@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Delegate to the shared AuthService so the mobile app gets the exact same tokens + claims. */
  login(username: string, password: string): Promise<LoginResult> {
    return this.auth.login(username, password);
  }

  /** Safe employee profile for the logged-in user (name, code, branch, job, photo). */
  async profile(user: JwtUser) {
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub } });
    if (!account) throw new NotFoundException('المستخدم غير موجود');

    const empCode = account.emp_code ?? user.emp_code;
    const emp =
      empCode != null
        ? await this.prisma.employees.findFirst({ where: { emp_code: empCode } })
        : null;

    return {
      userId: account.user_id,
      empCode: empCode ?? null,
      name: emp?.employee ?? account.name ?? '',
      branch: emp?.branch_id_fk ?? account.branch_id_fk ?? null,
      job: emp?.mosma_wazefy_n ?? null,
      photo: emp?.personal_photo ?? account.image ?? null,
      email: emp?.email ?? account.email ?? null,
      phone: emp?.phone ?? null,
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
    return { data };
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
    if (user.emp_code == null) return { data: [] };
    const rows = await this.prisma.hr_all_agzat_orders.findMany({
      where: { emp_code_fk: BigInt(user.emp_code) },
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

  /**
   * Foundation leave insert (legacy Api.php add_agaza).
   * NOTE: writes a minimal pending order (suspend=0, actions_sends defaults to 'start');
   * the full multi-stage approval routing belongs to the web leaves module.
   */
  async createLeave(user: JwtUser, dto: CreateLeaveDto) {
    if (user.emp_code == null) throw new ForbiddenException('الحساب غير مرتبط بموظف');
    const emp = await this.prisma.employees.findFirst({ where: { emp_code: user.emp_code } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const now = new Date();
    const dateAr = now.toISOString().slice(0, 10);

    const row = await this.prisma.hr_all_agzat_orders.create({
      data: {
        no3_agaza: dto.leaveTypeId,
        emp_id_fk: emp.id,
        emp_code_fk: BigInt(user.emp_code),
        edara_id_fk: emp.edara_id ?? undefined,
        edara_n: emp.edara_n ?? undefined,
        qsm_id_fk: emp.qsm_id ?? undefined,
        qsm_n: emp.qsm_n ?? undefined,
        agaza_from_date_m: dto.startDate,
        agaza_to_date_m: dto.endDate,
        agaza_date_ar: dateAr,
        agaza_date: dateAr,
        reason: dto.reason ?? undefined,
        suspend: SuspendStatus.INCOMING,
        publisher: user.sub,
        publisher_name: user.name ?? '',
      },
    });
    return { id: row.id };
  }

  /** The current employee's generic HR requests (hr_requests). */
  async requests(user: JwtUser) {
    if (user.emp_code == null) return { data: [] };
    const rows = await this.prisma.hr_requests.findMany({
      where: { emp_code_fk: user.emp_code },
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
    if (user.emp_code == null) throw new ForbiddenException('الحساب غير مرتبط بموظف');

    const now = new Date();
    const row = await this.prisma.hr_locations_visits.create({
      data: {
        emp_id_fk: user.emp_code,
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
}
