import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateLeaveDto, CreateVisitDto } from './dto/mobile.dto';
import { LeavesService } from '../leaves/leaves.service';
import { cairoDateString } from '../../common/utils/cairo-date';

/**
 * Mobile API foundation — employee-facing slice of the legacy Api.php controller.
 * Self-contained: data via PrismaService, auth/token issuance delegated to AuthService.
 * Primary-key joins use JwtUser.employeeId; business-code tables use
 * JwtUser.employeeCode. The two identifiers are never interchangeable.
 */
@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly leaveWorkflow: LeavesService,
  ) {}

  /** Delegate to the shared AuthService so the mobile app gets the exact same tokens + claims. */
  login(username: string, password: string) {
    return this.auth.authenticateStaff(username, password);
  }

  /** Safe employee profile for the logged-in user (name, code, branch, job, photo). */
  async profile(user: JwtUser) {
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub } });
    if (!account) throw new NotFoundException('المستخدم غير موجود');

    const employeeId = user.employeeId ?? account.emp_code;
    const emp =
      employeeId != null
        ? await this.prisma.employees.findUnique({ where: { id: employeeId } })
        : null;

    return {
      userId: account.user_id,
      employeeId: emp?.id ?? employeeId ?? null,
      empCode: emp?.emp_code ?? user.employeeCode ?? null,
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
        seen_date: cairoDateString(now),
        seen_time: now.toTimeString().slice(0, 5),
      },
    });
    return { id, seen: true };
  }

  /** The current employee's leave orders (hr_all_agzat_orders, matched on the business code). */
  async leaves(user: JwtUser) {
    if (user.employeeCode == null) return { data: [] };
    const rows = await this.prisma.hr_all_agzat_orders.findMany({
      where: { emp_code_fk: BigInt(user.employeeCode) },
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

  /** Mobile and web share the exact same validation, numbering, routing, and history workflow. */
  async createLeave(user: JwtUser, dto: CreateLeaveDto) {
    if (user.employeeId == null || user.employeeCode == null) {
      throw new ForbiddenException('الحساب غير مرتبط بموظف');
    }
    return this.leaveWorkflow.create({
      leaveTypeId: dto.leaveTypeId,
      empId: user.employeeId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
    }, user.sub, user.name ?? undefined);
  }

  /** The current employee's generic HR requests (hr_requests). */
  async requests(user: JwtUser) {
    if (user.employeeCode == null) return { data: [] };
    const rows = await this.prisma.hr_requests.findMany({
      where: { emp_code_fk: user.employeeCode },
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
    if (user.employeeId == null) throw new ForbiddenException('الحساب غير مرتبط بموظف');

    const now = new Date();
    const row = await this.prisma.hr_locations_visits.create({
      data: {
        emp_id_fk: user.employeeId,
        lat: dto.lat,
        long: dto.long,
        img_path: dto.img ?? undefined,
        notes: dto.notes ?? undefined,
        send_date_ar: cairoDateString(now),
        send_time: now.toTimeString().slice(0, 5),
      },
    });
    return { id: row.id };
  }
}
