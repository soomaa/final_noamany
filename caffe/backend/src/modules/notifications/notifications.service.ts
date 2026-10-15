import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface NotificationView {
  id: number;
  title: string;
  body: string;
  read: boolean;
  date: string | null;
  time: string | null;
}

export interface AlertItem {
  empId: number;
  empCode: number | null;
  name: string | null;
  date: string;
  daysLeft: number;
}

/** Parses the legacy varchar Gregorian dates (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY). */
function parseLooseDate(s?: string | null): Date | null {
  if (!s) return null;
  const v = s.trim();
  if (!v || v === '0' || v.startsWith('0000')) return null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) {
    return safeDate(+m[1], +m[2], +m[3]);
  }
  if ((m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/))) {
    return safeDate(+m[3], +m[2], +m[1]);
  }
  return null;
}
function safeDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return isNaN(dt.getTime()) ? null : dt;
}
function daysUntil(d: Date, today: Date): number {
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number): Promise<NotificationView[]> {
    const [rows, settings, messages] = await Promise.all([
      this.prisma.tbl_notifications.findMany({
        where: { to_user: userId },
        orderBy: { id: 'desc' },
        take: 50,
      }),
      this.prisma.tbl_sys_notifications_settings.findMany(),
      this.prisma.users_notifications.findMany({
        where: { notify_id_fk: { not: null } },
        orderBy: { id: 'desc' },
        take: 200,
      }),
    ]);
    const byCode = new Map(settings.map((s) => [s.code, s]));
    const msgByNotifyId = new Map(
      messages.filter((m) => m.notify_id_fk != null).map((m) => [m.notify_id_fk!, m.message ?? '']),
    );
    return rows.map((n) => {
      const linked = msgByNotifyId.get(n.id);
      const titleFromMsg = linked?.split(' — ')[0];
      const bodyFromMsg = linked?.includes(' — ') ? linked.split(' — ').slice(1).join(' — ') : linked;
      return {
        id: n.id,
        title: titleFromMsg ?? (n.n_code != null ? byCode.get(n.n_code)?.title : null) ?? 'إشعار',
        body: bodyFromMsg ?? linked ?? '',
        read: n.seen === 1,
        date: n.date_ar ?? null,
        time: n.time_ar ?? null,
      };
    });
  }

  async count(userId: number): Promise<number> {
    return this.prisma.tbl_notifications.count({ where: { to_user: userId, seen: 0 } });
  }

  async markRead(userId: number, id: number) {
    await this.prisma.tbl_notifications.updateMany({
      where: { id, to_user: userId },
      data: { seen: 1 },
    });
    return { id, read: true };
  }

  async markAllRead(userId: number) {
    const res = await this.prisma.tbl_notifications.updateMany({
      where: { to_user: userId, seen: 0 },
      data: { seen: 1 },
    });
    return { updated: res.count };
  }

  /**
   * DELETE /notifications/:id — faithful to Notifications::delete.
   * Scoped to the current user's own notifications (the legacy ownership check
   * was commented out, but we keep it scoped so users cannot delete others').
   */
  async remove(userId: number, id: number) {
    const res = await this.prisma.tbl_notifications.deleteMany({
      where: { id, to_user: userId },
    });
    return { id, deleted: res.count };
  }

  /** DELETE /notifications — faithful to Notifications::delete_all (current user). */
  async removeAll(userId: number) {
    const res = await this.prisma.tbl_notifications.deleteMany({
      where: { to_user: userId },
    });
    return { deleted: res.count };
  }

  /** Derived alerts from employee data (contracts, residency, insurance, birthdays, probation). */
  async alerts() {
    const g = await this.prisma.global_settings.findFirst();
    const contractDays = g?.alert_days_contract ?? 30;
    const residencyDays = g?.alert_days_quest ?? 30;
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

    const emps = await this.prisma.employees.findMany({
      where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
      select: {
        id: true,
        emp_code: true,
        employee: true,
        birth_date_m: true,
        end_contract_date_m: true,
        end_test_date_m: true,
        card_enhaa_date: true,
        tamin_medicine_end_date: true,
      },
    });

    const contractExpiring: AlertItem[] = [];
    const residencyExpiring: AlertItem[] = [];
    const insuranceExpiring: AlertItem[] = [];
    const probationEnding: AlertItem[] = [];
    const birthdays: AlertItem[] = [];

    const within = (raw: string | null | undefined, win: number, bucket: AlertItem[], e: (typeof emps)[number]) => {
      const d = parseLooseDate(raw);
      if (!d) return;
      const left = daysUntil(d, today);
      if (left >= 0 && left <= win) {
        bucket.push({ empId: e.id, empCode: e.emp_code, name: e.employee, date: raw!, daysLeft: left });
      }
    };

    for (const e of emps) {
      within(e.end_contract_date_m, contractDays, contractExpiring, e);
      within(e.card_enhaa_date, residencyDays, residencyExpiring, e);
      within(e.tamin_medicine_end_date, 30, insuranceExpiring, e);
      within(e.end_test_date_m, 14, probationEnding, e);

      const bd = parseLooseDate(e.birth_date_m);
      if (bd) {
        const next = new Date(Date.UTC(today.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate()));
        let left = daysUntil(next, today);
        if (left < 0) left = daysUntil(new Date(Date.UTC(today.getUTCFullYear() + 1, bd.getUTCMonth(), bd.getUTCDate())), today);
        if (left >= 0 && left <= 7) {
          birthdays.push({ empId: e.id, empCode: e.emp_code, name: e.employee, date: e.birth_date_m!, daysLeft: left });
        }
      }
    }

    const sortByDays = (a: AlertItem, b: AlertItem) => a.daysLeft - b.daysLeft;
    return {
      contractExpiring: contractExpiring.sort(sortByDays),
      residencyExpiring: residencyExpiring.sort(sortByDays),
      insuranceExpiring: insuranceExpiring.sort(sortByDays),
      probationEnding: probationEnding.sort(sortByDays),
      birthdays: birthdays.sort(sortByDays),
    };
  }
}
