import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { HR_JOB_TITLE_CODE } from '../../common/hr-approval/approval-chain';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { todayIso } from '../../common/utils/legacy-date.util';
import { isEmployeeInactive } from '../auth/employee-status.util';
import { PushService } from '../push/push.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import {
  AttendanceExceptionsService,
  PENDING_LOOKBACK_DAYS,
  STALE_AFTER_DAYS,
  caseInScope,
  isStaleDate,
  shiftIsoDate,
  summarize,
} from './attendance-exceptions.service';

/** RBAC role(s) whose holders count as HR for the escalation, besides job-title code 44 holders. */
const HR_ROLE_KEYS = ['hr_manager'];

export type ReminderKind = 'manager' | 'hr';

export interface ReminderRunResult {
  kind: ReminderKind;
  date: string;
  recipients: number;
  sent: number;
  skippedDuplicate: number;
}

/** Arabic count phrase: «حالة حضور واحدة», «حالتين حضور», «4 حالات حضور», «12 حالة حضور». */
export function casesPhrase(count: number): string {
  if (count === 1) return 'حالة حضور واحدة';
  if (count === 2) return 'حالتين حضور';
  if (count >= 3 && count <= 10) return `${count} حالات حضور`;
  return `${count} حالة حضور`;
}

/** «من يومين أو أكتر» for the stale threshold. */
const STALE_PHRASE = `من ${STALE_AFTER_DAYS === 2 ? 'يومين' : `${STALE_AFTER_DAYS} أيام`} أو أكتر`;

export function managerReminderText(total: number, recent: number, stale: number) {
  const parts = [`${recent} من امبارح والنهارده`];
  if (stale > 0) parts.push(`${stale} مفتوحة ${STALE_PHRASE}`);
  return {
    title: `عندك ${casesPhrase(total)} محتاجة قرار`,
    body: `${parts.join('، ')} — افتح «الحالات اليومية» واحسمها`,
  };
}

export function hrEscalationText(branches: Array<{ branchName: string | null; stale: number }>, total: number) {
  const list = branches
    .filter((branch) => branch.stale > 0)
    .map((branch) => `${branch.branchName ?? 'بدون فرع'}: ${branch.stale}`)
    .join('، ');
  return {
    title: `${casesPhrase(total)} مفتوحة ${STALE_PHRASE}`,
    body: `${list} — المدير لسه ما أخدش قرار، راجع «الحالات اليومية»`,
  };
}

/**
 * Daily reminders for «الحالات اليومية»: branch managers about the cases waiting for their decision,
 * HR about cases still open after STALE_AFTER_DAYS days. In-app (tbl_notifications +
 * users_notifications) and push, best-effort. A reminder log (hr_attendance_exception_reminders,
 * raw SQL — production never regenerates the Prisma Client) keeps a manager from getting the same
 * count twice on one day and HR to one escalation a day.
 */
@Injectable()
export class AttendanceExceptionsRemindersService {
  private readonly log = new Logger(AttendanceExceptionsRemindersService.name);
  private tableReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly exceptions: AttendanceExceptionsService,
    private readonly scope: BranchScopeService,
    private readonly permissions: PermissionEngineService,
    private readonly push: PushService,
  ) {}

  // ---------------------------------------------------------------------------
  // MANAGER REMINDER
  // ---------------------------------------------------------------------------

  async remindManagers(now = new Date()): Promise<ReminderRunResult> {
    const today = todayIso(now);
    const since = shiftIsoDate(today, PENDING_LOOKBACK_DAYS - 1);
    const yesterday = shiftIsoDate(today, 1);
    const result: ReminderRunResult = { kind: 'manager', date: today, recipients: 0, sent: 0, skippedDuplicate: 0 };
    const items = await this.exceptions.openCases(null, since, today, now);
    if (!items.length) return result;

    for (const manager of await this.managers()) {
      const mine = items.filter((item) => caseInScope(item, manager.branches, manager.section));
      if (!mine.length) continue;
      result.recipients += 1;
      const recent = mine.filter((item) => item.date >= yesterday).length;
      const stale = mine.filter((item) => isStaleDate(item.date, today)).length;
      if (!(await this.claim('manager', manager.userId, today, mine.length))) {
        result.skippedDuplicate += 1;
        continue;
      }
      const text = managerReminderText(mine.length, recent, stale);
      if (await this.deliver(manager.userId, text.title, text.body)) result.sent += 1;
    }
    this.log.log(`Manager reminders ${today}: recipients=${result.recipients} sent=${result.sent} dup=${result.skippedDuplicate}`);
    return result;
  }

  /**
   * Accounts that decide on cases: `attendance.exceptions:update`, not a system admin (they see every
   * branch and get the HR escalation if they are HR), with a branch scope — their branch and its
   * sub-branches, or every branch for one men/women section (مشرف إدارة حريمي / رجالي).
   */
  async managers(): Promise<Array<{ userId: number; branches: number[] | null; section: 'male' | 'female' | null }>> {
    const users = await this.prisma.users.findMany({
      where: { approved: 1, OR: [{ level: null }, { level: { not: 1 } }] },
      select: { user_id: true, level: true, emp_code: true, branch_id_fk: true, name: true },
    });
    const refs = [...new Set(users.map((user) => user.emp_code).filter((ref): ref is number => ref != null))];
    const employees = refs.length
      ? await this.prisma.employees.findMany({
          where: { OR: [{ id: { in: refs } }, { emp_code: { in: refs } }] },
          select: {
            id: true, emp_code: true, branch_id_fk: true, emp_type: true, mosma_wazefy_n: true,
            mosma_wazefy_code: true, employee_type: true, leave_emp: true,
          },
        })
      : [];
    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    const byCode = new Map(employees.filter((employee) => employee.emp_code != null).map((employee) => [employee.emp_code!, employee]));
    const jobCodes = [...new Set(employees.filter((e) => !e.mosma_wazefy_n?.trim() && e.mosma_wazefy_code).map((e) => e.mosma_wazefy_code!))];
    const jobs = jobCodes.length
      ? await this.prisma.department_jobs.findMany({ where: { id: { in: jobCodes } }, select: { id: true, name: true } })
      : [];
    const jobName = new Map(jobs.map((job) => [job.id, job.name]));

    const out: Array<{ userId: number; branches: number[] | null; section: 'male' | 'female' | null }> = [];
    for (const user of users) {
      const employee = user.emp_code != null ? byId.get(user.emp_code) ?? byCode.get(user.emp_code) : undefined;
      if (isEmployeeInactive(employee)) continue;
      let allowed: boolean;
      let superAdmin: boolean;
      try {
        const effective = await this.permissions.getEffective(user.user_id);
        superAdmin = effective.superAdmin;
        allowed = superAdmin || effective.keys.has('attendance.exceptions:update');
      } catch (error) {
        this.log.warn(`permissions of user ${user.user_id} unreadable: ${(error as Error).message}`);
        continue;
      }
      if (!allowed || superAdmin) continue;
      const jwt: JwtUser = {
        sub: user.user_id,
        level: user.level ?? null,
        is_super_admin: false,
        emp_code: user.emp_code ?? null,
        branch: employee?.branch_id_fk ?? user.branch_id_fk ?? 0,
        branch_name: null,
        man_women_type: employee?.emp_type ?? 0,
        name: user.name ?? null,
        image: null,
        job_title: employee?.mosma_wazefy_n?.trim()
          || (employee?.mosma_wazefy_code ? jobName.get(employee.mosma_wazefy_code)?.trim() : null)
          || null,
        is_trainer: false,
        trainer_id: null,
      };
      const branches = this.scope.allowedBranchIds(jwt);
      if (branches && !branches.length) continue;
      out.push({ userId: user.user_id, branches, section: this.exceptions.defaultSection(jwt) });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // HR ESCALATION
  // ---------------------------------------------------------------------------

  async escalateToHr(now = new Date()): Promise<ReminderRunResult> {
    const today = todayIso(now);
    const since = shiftIsoDate(today, PENDING_LOOKBACK_DAYS - 1);
    const result: ReminderRunResult = { kind: 'hr', date: today, recipients: 0, sent: 0, skippedDuplicate: 0 };
    const stale = (await this.exceptions.openCases(null, since, today, now)).filter((item) => isStaleDate(item.date, today));
    if (!stale.length) return result;
    const summary = summarize(stale, since, today);
    const text = hrEscalationText(summary.branches, stale.length);

    for (const userId of await this.hrUserIds()) {
      result.recipients += 1;
      if (!(await this.claim('hr', userId, today, stale.length))) {
        result.skippedDuplicate += 1;
        continue;
      }
      if (await this.deliver(userId, text.title, text.body)) result.sent += 1;
    }
    this.log.log(`HR escalation ${today}: stale=${stale.length} recipients=${result.recipients} sent=${result.sent}`);
    return result;
  }

  /**
   * HR: every active holder of job-title code 44 (hr_egraat_emp_setting) and every account with an
   * HR role; nobody → the first admin account, so the escalation is never lost.
   */
  async hrUserIds(): Promise<number[]> {
    const ids = new Set<number>();
    const settings = await this.prisma.hr_egraat_emp_setting.findMany({
      where: { job_title_code_fk: HR_JOB_TITLE_CODE, person_suspend: 1 },
      select: { person_id: true, person_code: true },
    });
    const refs = [...new Set(settings
      .map((setting) => setting.person_id ?? (setting.person_code ? parseInt(setting.person_code, 10) : NaN))
      .filter((ref): ref is number => Number.isFinite(ref) && ref > 0))];
    if (refs.length) {
      const employees = await this.prisma.employees.findMany({
        where: { OR: [{ id: { in: refs } }, { emp_code: { in: refs } }] },
        select: { id: true, emp_code: true, employee_type: true, leave_emp: true },
      });
      const active = employees.filter((employee) => !isEmployeeInactive(employee));
      const accountRefs = [...new Set(active.flatMap((employee) => [employee.id, employee.emp_code]).filter((ref): ref is number => ref != null))];
      if (accountRefs.length) {
        const users = await this.prisma.users.findMany({
          where: { emp_code: { in: accountRefs }, approved: 1 },
          select: { user_id: true },
        });
        for (const user of users) ids.add(user.user_id);
      }
    }
    const roleUsers = await this.prisma.rbac_user_roles.findMany({
      where: {
        role: { key: { in: HR_ROLE_KEYS } },
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      select: { user_id: true },
    });
    if (roleUsers.length) {
      const approved = await this.prisma.users.findMany({
        where: { user_id: { in: roleUsers.map((row) => row.user_id) }, approved: 1 },
        select: { user_id: true },
      });
      for (const user of approved) ids.add(user.user_id);
    }
    if (!ids.size) {
      const admin = await this.prisma.users.findFirst({
        where: { level: 1, approved: 1 },
        orderBy: { user_id: 'asc' },
        select: { user_id: true },
      });
      if (admin) ids.add(admin.user_id);
    }
    return [...ids];
  }

  // ---------------------------------------------------------------------------
  // DELIVERY + DEDUP
  // ---------------------------------------------------------------------------

  /** In-app + push; never throws. */
  private async deliver(userId: number, title: string, body: string): Promise<boolean> {
    try {
      await this.push.sendToUsers([userId], title, body);
      return true;
    } catch (error) {
      this.log.warn(`attendance reminder to user ${userId} failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Record that `userId` gets a `kind` reminder for `date` with `count` open cases. False when that
   * is a duplicate: HR got one already today, or the manager already got this same count today.
   * With the log unreadable the reminder still goes out (better twice than never).
   */
  async claim(kind: ReminderKind, userId: number, date: string, count: number): Promise<boolean> {
    try {
      await this.ensureTable();
      const rows = await this.prisma.$queryRaw<Array<{ open_count: number | bigint }>>(Prisma.sql`
        SELECT open_count FROM hr_attendance_exception_reminders
        WHERE kind = ${kind} AND user_id = ${userId} AND ref_date = ${date}
        LIMIT 1
      `);
      const previous = rows[0];
      if (previous && (kind === 'hr' || Number(previous.open_count) === count)) return false;
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO hr_attendance_exception_reminders (kind, user_id, ref_date, open_count, sent_count, first_sent_at, last_sent_at)
        VALUES (${kind}, ${userId}, ${date}, ${count}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE open_count = VALUES(open_count), sent_count = sent_count + 1, last_sent_at = CURRENT_TIMESTAMP
      `);
      return true;
    } catch (error) {
      this.log.warn(`hr_attendance_exception_reminders unavailable: ${(error as Error).message}`);
      return true;
    }
  }

  /** Same DDL as migration 20261125120000_hr_manager_reminders, for a server that has not run it. */
  private async ensureTable() {
    if (this.tableReady) return;
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`hr_attendance_exception_reminders\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`kind\` VARCHAR(20) NOT NULL,
        \`user_id\` INTEGER NOT NULL,
        \`ref_date\` CHAR(10) NOT NULL,
        \`open_count\` INTEGER NOT NULL DEFAULT 0,
        \`sent_count\` INTEGER NOT NULL DEFAULT 1,
        \`first_sent_at\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
        \`last_sent_at\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
        UNIQUE INDEX \`uq_attendance_reminder_kind_user_date\`(\`kind\`, \`user_id\`, \`ref_date\`),
        INDEX \`idx_attendance_reminder_date\`(\`ref_date\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    this.tableReady = true;
  }
}
