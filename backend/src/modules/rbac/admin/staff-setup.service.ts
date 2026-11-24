import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { syncEmployeeTrainer } from '../../club-fitness/trainer-sync.util';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtUser } from '../../../common/types/jwt-user';
import { ensureRoleForJobTitle, isJobTitleRoleKey } from '../job-title-role.util';
import { RbacUsersService } from './rbac-users.service';

/** Same default as an employee saved from the HR form without an account (employees.service). */
const EMPLOYEE_DEFAULT_PASSWORD = '102030';

/** emp_type: 1 رجالي, 2 حريمي, 3 الكل (same values as the employee form). */
export const STAFF_SECTIONS = [1, 2, 3] as const;

export interface StaffSetupAccount {
  userId: number;
  username: string | null;
  name: string | null;
  enabled: boolean;
  /** The account carries another person's name (linked to this file by mistake). */
  otherPerson: boolean;
  roles: { id: number; key: string; name: string }[];
  hasJobRole: boolean;
}

export interface StaffSetupRow {
  id: number;
  empCode: number | null;
  name: string;
  phone: string | null;
  branchId: number | null;
  branchName: string | null;
  active: boolean;
  section: number;
  jobTitleId: number | null;
  /** Job title as typed in the old system when no code is set. */
  jobTitleText: string | null;
  accounts: StaffSetupAccount[];
}

const sameName = (a?: string | null, b?: string | null) => (a ?? '').trim() === (b ?? '').trim();

/**
 * System administration → تظبيط الموظفين: one row per employee with the two things HR must set
 * (section رجالي/حريمي and job title). Saving a row also sets the login account up, so the
 * employee opens the system with the right sidebar: the job-title role (other job-title roles
 * replaced, any other role such as الإجازات/الأذونات kept), the account enabled when the employee
 * is active, and an account created (username = phone, password 102030) when there is none.
 */
@Injectable()
export class StaffSetupService {
  private readonly logger = new Logger('StaffSetupService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacUsers: RbacUsersService,
  ) {}

  async list(): Promise<{ rows: StaffSetupRow[]; jobTitles: { id: number; name: string }[] }> {
    const [employees, jobs, branches] = await Promise.all([
      this.prisma.employees.findMany({
        select: {
          id: true, emp_code: true, employee: true, phone: true, branch_id_fk: true, emp_type: true,
          employee_type: true, leave_emp: true, mosma_wazefy_code: true, mosma_wazefy_n: true,
        },
        orderBy: [{ branch_id_fk: 'asc' }, { employee: 'asc' }],
      }),
      this.prisma.department_jobs.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.tbl_branches.findMany({ select: { branch_id: true, branch_name: true } }),
    ]);
    const ids = employees.map((e) => e.id);
    const users = ids.length
      ? await this.prisma.users.findMany({
          where: { emp_code: { in: ids } },
          select: { user_id: true, username: true, name: true, approved: true, emp_code: true },
          orderBy: { user_id: 'asc' },
        })
      : [];
    const userRoles = users.length
      ? await this.prisma.rbac_user_roles.findMany({
          where: { user_id: { in: users.map((u) => u.user_id) } },
          select: { user_id: true, role: { select: { id: true, key: true, name_ar: true } } },
        })
      : [];
    const branchName = new Map(branches.map((b) => [b.branch_id, b.branch_name]));
    const jobIds = new Set(jobs.map((j) => j.id));

    const rows = employees.map((e): StaffSetupRow => {
      const jobTitleId = e.mosma_wazefy_code && jobIds.has(e.mosma_wazefy_code) ? e.mosma_wazefy_code : null;
      const accounts = users
        .filter((u) => u.emp_code === e.id)
        .map((u): StaffSetupAccount => {
          const roles = userRoles
            .filter((r) => r.user_id === u.user_id)
            .map((r) => ({ id: r.role.id, key: r.role.key, name: r.role.name_ar }));
          return {
            userId: u.user_id,
            username: u.username,
            name: u.name,
            enabled: u.approved === 1,
            otherPerson: !sameName(u.name, e.employee),
            roles,
            hasJobRole: jobTitleId != null && roles.some((r) => r.key === `job_title_${jobTitleId}`),
          };
        });
      return {
        id: e.id,
        empCode: e.emp_code,
        name: (e.employee ?? '').trim(),
        phone: e.phone,
        branchId: e.branch_id_fk,
        branchName: e.branch_id_fk != null ? branchName.get(e.branch_id_fk) ?? null : null,
        active: (e.employee_type ?? 1) === 1 && e.leave_emp !== 1,
        section: e.emp_type,
        jobTitleId,
        jobTitleText: jobTitleId ? null : e.mosma_wazefy_n?.trim() || null,
        accounts,
      };
    });
    return { rows, jobTitles: jobs.map((j) => ({ id: j.id, name: j.name.trim() })) };
  }

  async save(
    employeeId: number,
    dto: { section: number; jobTitleId: number },
    actorUserId: number,
    actor: JwtUser,
  ): Promise<{ row: StaffSetupRow; createdAccount: { username: string; password: string } | null }> {
    if (!STAFF_SECTIONS.includes(dto.section as (typeof STAFF_SECTIONS)[number])) {
      throw new BadRequestException('اختار رجالي أو حريمي أو الكل');
    }
    const emp = await this.prisma.employees.findUnique({
      where: { id: employeeId },
      select: { id: true, employee: true, phone: true, branch_id_fk: true, employee_type: true, leave_emp: true },
    });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const job = await this.prisma.department_jobs.findUnique({ where: { id: dto.jobTitleId } });
    if (!job) throw new BadRequestException('المسمى الوظيفي غير موجود');
    const role = await ensureRoleForJobTitle(this.prisma, job);
    const active = (emp.employee_type ?? 1) === 1 && emp.leave_emp !== 1;

    // The person's own accounts: every linked account carrying their name (or the only one linked).
    let accounts = await this.prisma.users.findMany({
      where: { emp_code: employeeId },
      select: { user_id: true, name: true, approved: true },
    });
    if (accounts.length > 1) accounts = accounts.filter((u) => sameName(u.name, emp.employee));

    let createdAccount: { username: string; password: string } | null = null;
    if (!accounts.length) {
      const username = (emp.phone ?? '').trim();
      if (!username) throw new BadRequestException('الموظف مالوش رقم موبايل يتعمل بيه حساب. اكتبه من تعديل الموظف الأول');
      const taken = await this.prisma.users.findFirst({ where: { username }, select: { name: true } });
      if (taken) throw new ConflictException(`رقم الموبايل ${username} مستخدم لحساب "${taken.name ?? ''}". صحح الرقم من تعديل الموظف`);
      const created = await this.prisma.users.create({
        data: {
          username,
          password: await bcrypt.hash(EMPLOYEE_DEFAULT_PASSWORD, 12),
          approved: active ? 1 : 0,
          level: 2,
          name: (emp.employee ?? '').trim(),
          emp_code: employeeId,
          branch_id_fk: emp.branch_id_fk,
          role_id_fk: role.id,
          must_change_password: false,
        },
        select: { user_id: true, name: true, approved: true },
      });
      accounts = [created];
      createdAccount = { username, password: EMPLOYEE_DEFAULT_PASSWORD };
    }

    // Roles first: it runs the anti-escalation checks and may refuse before anything is written.
    for (const account of accounts) {
      const current = await this.prisma.rbac_user_roles.findMany({
        where: { user_id: account.user_id },
        select: { role: { select: { id: true, key: true } } },
      });
      const keep = current.filter((r) => !isJobTitleRoleKey(r.role.key)).map((r) => r.role.id);
      await this.rbacUsers.setUserRoles(account.user_id, { roleIds: [...keep, role.id] }, actorUserId, actor);
    }

    await this.prisma.$transaction([
      this.prisma.employees.update({
        where: { id: employeeId },
        data: { emp_type: dto.section, mosma_wazefy_code: job.id, mosma_wazefy_n: job.name.trim().slice(0, 50) },
      }),
      this.prisma.users.updateMany({
        where: { user_id: { in: accounts.map((a) => a.user_id) } },
        data: { role_id_fk: role.id, ...(active ? { approved: 1 } : {}) },
      }),
    ]);
    // Made a captain (or no longer one) here: create / hide the coach record like the employee form
    // does (client, 23 Nov). The job change itself is already saved; a roster hiccup must not undo it.
    try {
      await syncEmployeeTrainer(this.prisma, employeeId);
    } catch (error) {
      this.logger.warn(`coach roster not synced for employee ${employeeId}: ${(error as Error)?.message ?? error}`);
    }

    const { rows } = await this.list();
    const row = rows.find((r) => r.id === employeeId);
    if (!row) throw new NotFoundException('الموظف غير موجود');
    return { row, createdAccount };
  }
}
