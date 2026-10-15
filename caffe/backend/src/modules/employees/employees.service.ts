import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { parseShiftType, shiftTypeToLabel } from '../../common/constants/shift-type.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { formToData, rowToForm } from './employees.fieldmap';
import {
  resolveRoleIdForJobTitleId,
  syncEmployeeUserRole,
} from '../rbac/job-title-role.util';
import { syncEmployeeTrainer } from '../club-fitness/trainer-sync.util';
import { resolveSettingsIdsToTitles, resolveSettingsTitlesToIds } from './employees.lookup-resolver';
import {
  isMarketingRepJobTitle,
  marketingRepEmployeeWhere,
  marketingRepJobTitleWhere,
} from './marketing-rep.util';

const DAY_COL: Record<number, 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'> = {
  6: 'saturday',
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
};
const METHOD_TO_NUM: Record<string, number> = { fixed: 1, percent: 2, days: 3 };
const METHOD_FROM_NUM: Record<number, string> = { 1: 'fixed', 2: 'percent', 3: 'days' };

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: PaginationDto & { branch?: string; edara?: string; gender?: string; emp_type?: string; status?: string }) {
    const where: Prisma.employeesWhereInput = { OR: [{ leave_emp: null }, { leave_emp: 0 }] };
    const and: Prisma.employeesWhereInput[] = [];

    if (q.search?.trim()) {
      const s = q.search.trim();
      const code = parseInt(s, 10);
      and.push({
        OR: [
          { employee: { contains: s } },
          { phone: { contains: s } },
          ...(Number.isNaN(code) ? [] : [{ emp_code: code }]),
        ],
      });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id_fk: Number(q.branch) });
    if (q.edara && q.edara !== 'all') and.push({ edara_id: Number(q.edara) });
    if (q.gender && q.gender !== 'all') and.push({ gender: Number(q.gender) });
    if (q.emp_type && q.emp_type !== 'all') and.push({ emp_type: Number(q.emp_type) });
    if (q.status && q.status !== 'all') and.push({ employee_type: Number(q.status) });
    if (and.length) where.AND = and;

    const [rows, total] = await Promise.all([
      this.prisma.employees.findMany({
        where,
        select: {
          id: true,
          emp_code: true,
          employee: true,
          edara_n: true,
          qsm_n: true,
          phone: true,
          card_num: true,
          mosma_wazefy_n: true,
          employee_type: true,
          personal_photo: true,
          nationality: true,
          branch_id_fk: true,
          gender: true,
        },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.employees.count({ where }),
    ]);
    return paginated(rows, total, q.page, q.pageSize);
  }

  /** Minimal active-employee directory for POS account sales; no HR-sensitive fields. */
  async posOptions() {
    return this.prisma.employees.findMany({
      where: {
        employee_type: 1,
        OR: [{ leave_emp: null }, { leave_emp: 0 }],
      },
      select: { id: true, employee: true, emp_code: true },
      orderBy: [{ employee: 'asc' }, { emp_code: 'asc' }],
    });
  }

  /**
   * Next emp_code. Faithful port of Human_resources::get_next_emp_code:
   * when an edara (department) is given, the code is drawn from that edara's
   * configured range (hr_edarat_aqsam.from_code..to_code). next = MAX(emp_code)
   * within [from..to] for that edara + 1, or from_code if none exist yet.
   * Throws "exceeded range" when the range is full. Falls back to the global
   * MAX+1 when no edara is supplied (legacy add-form default).
   */
  async nextCode(edaraId?: number): Promise<{ nextCode: number; status: string }> {
    if (!edaraId) {
      const max = await this.prisma.employees.aggregate({ _max: { emp_code: true } });
      return { nextCode: (max._max.emp_code ?? 1000) + 1, status: 'ok' };
    }

    const edara = await this.prisma.hr_edarat_aqsam.findUnique({ where: { id: edaraId } });
    if (!edara || edara.from_code == null || edara.to_code == null) {
      throw new BadRequestException('بيانات ناقصة');
    }
    const fromCode = edara.from_code;
    const toCode = edara.to_code;

    // MAX(emp_code) within [from..to] for this edara.
    const agg = await this.prisma.employees.aggregate({
      _max: { emp_code: true },
      where: {
        edara_id: edaraId,
        emp_code: { gte: fromCode, lte: toCode },
      },
    });
    const maxCode = agg._max.emp_code ?? null;

    let nextCode: number;
    if (maxCode == null) {
      nextCode = fromCode;
    } else {
      nextCode = maxCode + 1;
      if (nextCode > toCode) {
        throw new BadRequestException('تم الوصول إلى الحد الأقصى للأكواد في هذه الإدارة');
      }
    }
    return { nextCode, status: 'ok' };
  }

  /** Edit form prefill — DB row reverse-mapped to the form's field names. */
  async findForForm(id: number) {
    const row = await this.prisma.employees.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الموظف غير موجود');
    const form = rowToForm(row as unknown as Record<string, unknown>);
    const resolved = await resolveSettingsTitlesToIds(this.prisma, form);
    if (row.mosma_wazefy_code) resolved.job_title_id_fk = String(row.mosma_wazefy_code);
    const loginUser = await this.prisma.users.findFirst({
      where: { emp_code: id },
      select: { role_id_fk: true, user_id: true, username: true },
    });
    if (loginUser) {
      resolved.addToSystem = 'true';
      resolved.systemUsername = loginUser.username ?? '';
    } else {
      resolved.addToSystem = 'false';
    }
    const trainer = await this.prisma.club_trainers.findUnique({
      where: { employee_id: id },
      select: {
        salaries: {
          where: { is_active: true },
          orderBy: { effective_date: 'desc' },
          take: 1,
          select: { class_commission_percentage: true },
        },
      },
    });
    resolved.class_commission_percentage = trainer?.salaries[0]
      ? String(trainer.salaries[0].class_commission_percentage)
      : '0';
    return { id: row.id, ...resolved };
  }

  private async syncTrainerCommission(employeeId: number, body: Record<string, unknown>) {
    const trainerId = await syncEmployeeTrainer(this.prisma, employeeId);
    if (!trainerId) return;
    const trainer = await this.prisma.club_trainers.findUnique({ where: { id: trainerId } });
    if (!trainer?.is_active) return;
    const commission = Number(body.class_commission_percentage ?? body.classCommissionPercentage ?? 0);
    const basicSalary = Number(body.basic_salary);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      throw new BadRequestException('عمولة الحصص يجب أن تكون بين 0 و100');
    }
    const active = await this.prisma.club_trainer_salaries.findFirst({
      where: { trainer_id: trainerId, is_active: true },
      orderBy: { effective_date: 'desc' },
    });
    if (active) {
      await this.prisma.club_trainer_salaries.update({
        where: { id: active.id },
        data: { base_salary: basicSalary, class_commission_percentage: commission },
      });
      return;
    }
    await this.prisma.club_trainer_salaries.create({
      data: {
        trainer_id: trainerId,
        base_salary: basicSalary,
        class_commission_percentage: commission,
        subscription_commission_percentage: 0,
        effective_date: new Date().toISOString().slice(0, 10),
        is_active: true,
      },
    });
  }

  /** Profile view — raw columns (the profile page reads these directly). */
  async profile(id: number) {
    const row = await this.prisma.employees.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الموظف غير موجود');
    return row;
  }

  /**
   * Server-side validation mirroring the legacy add_employee_new /
   * update_employee form_validation rules (required: edara, qsm, emp_code,
   * name, branch, jwal, emp_type) + phone format. Arabic messages.
   * `isEdit` relaxes emp_code (the business key is not reassigned on edit).
   */
  private validateEmployeeBody(body: Record<string, unknown>, isEdit = false) {
    const str = (v: unknown) => String(v ?? '').trim();
    const required: Array<[string, string]> = [
      ['job_title_id_fk', 'المسمى الوظيفي'],
      ['employment_type', 'نوع العقد'],
      ['emp_name', 'اسم الموظف'],
      ['branch_id_fk', 'الفرع'],
      ['jwal', 'رقم الجوال'],
      ['emp_type', 'النوع (رجالى/حريمى)'],
      ['basic_salary', 'الراتب الأساسي'],
    ];
    if (!isEdit) required.push(['emp_code', 'كود الموظف']);
    for (const [field, label] of required) {
      if (str(body[field]) === '') throw new BadRequestException(`${label} حقل مطلوب`);
    }
    // Phone format: Egyptian mobile (01xxxxxxxxx) or international digits (9–15).
    const phone = str(body.jwal);
    if (phone !== '' && !/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ''))) {
      throw new BadRequestException('رقم الجوال غير صحيح');
    }
    const basicSalary = Number(str(body.basic_salary));
    if (!Number.isFinite(basicSalary) || basicSalary <= 0) {
      throw new BadRequestException('الراتب الأساسي يجب أن يكون رقمًا أكبر من صفر');
    }
  }

  /** date_ar (Y-m-d) + date_s (unix epoch as string) mirrors + publisher stamp. */
  private dualDateStamps(userId?: number): Record<string, unknown> {
    const now = new Date();
    const dateAr = now.toISOString().slice(0, 10); // Y-m-d (legacy date('Y-m-d'))
    const dateS = String(Math.floor(now.getTime() / 1000)); // strtotime() epoch
    return { date_ar: dateAr, date_s: dateS, publisher: userId ?? null };
  }

  async create(body: Record<string, unknown>, userId?: number) {
    this.validateEmployeeBody(body, false);
    const resolvedBody = await this.applyJobTitle(await resolveSettingsIdsToTitles(this.prisma, body));
    const data = formToData(resolvedBody);

    // Manual emp_code: reject duplicates up-front.
    if (data.emp_code != null) {
      const dup = await this.prisma.employees.findFirst({ where: { emp_code: data.emp_code as number } });
      if (dup) throw new BadRequestException('كود الموظف مُستخدم مسبقًا');
    }

    const buildData = (): Prisma.employeesCreateInput =>
      ({
        ...data,
        ...this.dualDateStamps(userId),
        neqat_total: 7000, // legacy new-flow seed
        demo_card: (data.demo_card as string) ?? '',
        shahadt_jaish: (data.shahadt_jaish as 'yes' | 'no') ?? 'no',
        tamin_rkm: (data.tamin_rkm as number) ?? 0,
        khedma_year: 0,
        age: (data.age as number) ?? 0,
      }) as Prisma.employeesCreateInput;

    // Auto-generated emp_code (max+1) must be serialized — a MySQL advisory lock on the
    // same pooled connection stops two concurrent creates from minting the same code.
    // Manual codes were already de-duplicated above, so they skip the lock.
    const created =
      data.emp_code == null
        ? await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT GET_LOCK('employee_code', 10)`;
            try {
              const max = await tx.employees.aggregate({ _max: { emp_code: true } });
              const createData = buildData();
              createData.emp_code = (max._max.emp_code ?? 1000) + 1;
              return tx.employees.create({ data: createData });
            } finally {
              await tx.$queryRaw`SELECT RELEASE_LOCK('employee_code')`;
            }
          })
        : await this.prisma.employees.create({ data: buildData() });

    // Optionally provision a login user when "add to system" is enabled.
    if (this.parseAddToSystem(body)) {
      const roleId = await this.resolveRoleIdForJobTitle(resolvedBody);
      const creds = this.parseSystemCredentials(body, (data.phone as string) ?? '', true);
      await this.provisionUser(
        created.id,
        (data.employee as string) ?? '',
        (data.phone as string) ?? '',
        (data.branch_id_fk as number) ?? null,
        roleId,
        undefined,
        creds,
      );
    }

    // Trainer job title → mirror into the club_trainers roster (class trainer picker).
    await this.syncTrainerCommission(created.id, body);

    return { id: created.id, emp_code: created.emp_code };
  }

  /** Sales specialists (أخصائي مبيعات) for member registration dropdown. */
  async salesReps() {
    const marketingJobs = await this.prisma.department_jobs.findMany({
      where: marketingRepJobTitleWhere,
      select: { id: true },
    });
    const jobIds = marketingJobs.map((j) => j.id);
    const rows = await this.prisma.employees.findMany({
      where: {
        AND: [
          { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
          { employee_type: 1 },
          marketingRepEmployeeWhere(jobIds),
        ],
      },
      select: { id: true, employee: true, emp_code: true, branch_id_fk: true },
      orderBy: { employee: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.employee,
      empCode: r.emp_code,
      branchId: r.branch_id_fk,
    }));
  }

  /** Whether the logged-in user is a sales specialist (أخصائي مبيعات). */
  async isSalesEmployee(userEmpId: number | null): Promise<boolean> {
    if (!userEmpId) return false;
    const emp = await this.prisma.employees.findUnique({
      where: { id: userEmpId },
      select: { mosma_wazefy_code: true, mosma_wazefy_n: true },
    });
    if (!emp) return false;
    if (isMarketingRepJobTitle(emp.mosma_wazefy_n)) return true;
    if (emp.mosma_wazefy_code) {
      const job = await this.prisma.department_jobs.findUnique({
        where: { id: emp.mosma_wazefy_code },
        select: { name: true },
      });
      if (isMarketingRepJobTitle(job?.name)) return true;
    }
    return false;
  }

  private parseAddToSystem(body: Record<string, unknown>): boolean {
    const raw = body.addToSystem ?? body.add_to_system;
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
  }

  private parseSystemCredentials(
    body: Record<string, unknown>,
    phone: string,
    requirePassword = true,
  ): { username: string; password?: string } {
    const username = String(body.systemUsername ?? body.username ?? '').trim();
    const password = String(body.systemPassword ?? body.password ?? '').trim();
    if (!username) throw new BadRequestException('اسم المستخدم مطلوب عند إضافة الموظف للنظام');
    if (requirePassword && !password) {
      throw new BadRequestException('كلمة المرور مطلوبة عند إضافة الموظف للنظام');
    }
    return { username, password: password || undefined };
  }

  private async applyJobTitle(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const raw = body.job_title_id_fk ?? body.mosma_wazefy_code;
    if (raw == null || raw === '') return body;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return body;
    const job = await this.prisma.department_jobs.findUnique({ where: { id } });
    if (!job) throw new BadRequestException('المسمى الوظيفي المحدد غير موجود');
    return {
      ...body,
      job_title_id_fk: String(id),
      mosma_wazefy_code: String(id),
      mosma_wazefy_n: job.name,
    };
  }

  /** Map job title → RBAC role (1:1 linked role per المسمى الوظيفي). */
  private async resolveRoleIdForJobTitle(body: Record<string, unknown>): Promise<number> {
    const raw = body.job_title_id_fk ?? body.mosma_wazefy_code;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('المسمى الوظيفي مطلوب لربط صلاحيات النظام');
    }
    return resolveRoleIdForJobTitleId(this.prisma, id);
  }

  /** Extract an optional RBAC roleId from a raw employee form body (legacy override). */
  private parseRoleId(body: Record<string, unknown>): number | undefined {
    const raw = body.roleId ?? body.role_id ?? body.role_id_fk;
    if (raw == null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  async update(id: number, body: Record<string, unknown>, userId?: number) {
    const existing = await this.prisma.employees.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الموظف غير موجود');
    this.validateEmployeeBody(body, true);
    const resolvedBody = await this.applyJobTitle(await resolveSettingsIdsToTitles(this.prisma, body));
    const data = formToData(resolvedBody);
    delete data.emp_code; // never reassign the business key on edit
    await this.prisma.employees.update({
      where: { id },
      data: { ...data, ...this.dualDateStamps(userId) },
    });

    if (data.personal_photo != null) {
      const photo = String(data.personal_photo).trim();
      const linkedUser = await this.prisma.users.findFirst({ where: { emp_code: id } });
      if (linkedUser && photo && photo !== '0') {
        await this.prisma.users.update({
          where: { user_id: linkedUser.user_id },
          data: { image: photo },
        });
      }
    }

    const newPhone = (data.phone as string) ?? existing.phone ?? '';
    if (this.parseAddToSystem(body)) {
      const roleId = await this.resolveRoleIdForJobTitle(resolvedBody);
      const creds = this.parseSystemCredentials(body, newPhone, false);
      await this.provisionUser(
        id,
        (data.employee as string) ?? existing.employee ?? '',
        newPhone,
        (data.branch_id_fk as number) ?? existing.branch_id_fk ?? null,
        roleId,
        existing.phone ?? undefined,
        creds,
      );
    } else {
      await syncEmployeeUserRole(this.prisma, id);
    }

    // Keep the club_trainers roster aligned with the (possibly changed) job title.
    await this.syncTrainerCommission(id, body);
    return { id };
  }

  /**
   * Faithful port of Employee_model::add_users — create a level-2 login user keyed
   * to the employee. Permissions are resolved automatically from the job title (المسمى الوظيفي).
   * users.emp_code stores employees.id (legacy convention).
   *
   * Idempotent on phone: if a user already exists for this phone, we only update its
   * role when a new roleId was explicitly provided (so re-assigning permissions on
   * employee edit works), otherwise leave it untouched.
   */
  private async provisionUser(
    empId: number,
    name: string,
    phone: string,
    branchId: number | null,
    roleId?: number,
    previousPhone?: string,
    credentials?: { username: string; password?: string },
  ) {
    if (!phone && !credentials?.username) return;

    const empRow = await this.prisma.employees.findUnique({
      where: { id: empId },
      select: { personal_photo: true },
    });
    const avatarFromEmp = empRow?.personal_photo?.trim();
    const avatarImage =
      avatarFromEmp && avatarFromEmp !== '0' ? avatarFromEmp : 'user-20250803a67b668cca.png';

    const username = credentials?.username?.trim() || phone;
    const plainPassword = credentials?.password?.trim() || phone.replace(/\D/g, '') || phone;

    // Block duplicate phone on another employee's app/login account.
    const otherEmp = await this.prisma.employees.findFirst({
      where: { phone, id: { not: empId } },
      select: { id: true, employee: true },
    });
    if (otherEmp) {
      throw new ConflictException(`رقم الجوال مُستخدم لموظف آخر: ${otherEmp.employee ?? otherEmp.id}`);
    }

    const dupApp = await this.prisma.api_users.findFirst({ where: { user_phone: phone } });
    const linkedEmp = await this.prisma.employees.findFirst({ where: { app_user_id: dupApp?.user_id } });
    if (dupApp && linkedEmp && linkedEmp.id !== empId) {
      throw new ConflictException('رقم الجوال مُستخدم لحساب تطبيق موظف آخر');
    }

    // Resolve the account by its employee link first. A username/phone match alone is never
    // ownership proof: reassigning such a row could turn an employee edit into an account takeover.
    const linkedUser = await this.prisma.users.findFirst({ where: { emp_code: empId } });
    const conflictingUser = await this.prisma.users.findFirst({
      where: {
        OR: [{ username }, ...(phone && phone !== username ? [{ username: phone }] : [])],
        ...(linkedUser ? { user_id: { not: linkedUser.user_id } } : {}),
      },
    });
    if (conflictingUser) {
      throw new ConflictException('اسم المستخدم أو رقم الجوال مستخدم لحساب نظام آخر');
    }

    if (linkedUser) {
      await this.prisma.users.update({
        where: { user_id: linkedUser.user_id },
        data: { name, branch_id_fk: branchId, username },
      });
      if (avatarFromEmp) {
        await this.prisma.users.update({
          where: { user_id: linkedUser.user_id },
          data: { image: avatarFromEmp },
        });
      }
      if (credentials?.password) {
        const pwd = await bcrypt.hash(plainPassword, 12);
        await this.prisma.users.update({
          where: { user_id: linkedUser.user_id },
          data: { password: pwd, app_pass: null, pass_demo: null, user_pass: null, x_y_z: null },
        });
      }
      if (roleId != null) {
        await this.prisma.users.update({ where: { user_id: linkedUser.user_id }, data: { role_id_fk: roleId } });
        await this.grantRbacRole(linkedUser.user_id, roleId);
      } else {
        await syncEmployeeUserRole(this.prisma, empId);
      }
      return;
    }

    if (roleId == null) {
      throw new BadRequestException('يجب اختيار دور/صلاحيات للموظف');
    }

    const pwd = await bcrypt.hash(plainPassword, 12);
    const createdUser = await this.prisma.users.create({
      data: {
        username,
        approved: 1,
        password: pwd,
        app_pass: null,
        pass_demo: null,
        user_pass: null,
        image: avatarImage,
        x_y_z: null,
        level: 2,
        role_id_fk: roleId,
        name,
        emp_code: empId,
        branch_id_fk: branchId,
      },
      select: { user_id: true },
    });
    await this.grantRbacRole(createdUser.user_id, roleId);
  }

  /**
   * Link an RBAC role to a login user so the permission engine grants its access.
   * Non-destructive (upsert on the unique user+role pair) and guarded: a non-existent
   * roleId is ignored rather than throwing an FK error mid employee-create.
   */
  private async grantRbacRole(userId: number, roleId: number) {
    const role = await this.prisma.rbac_roles.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) return;
    await this.prisma.rbac_user_roles.deleteMany({ where: { user_id: userId } });
    await this.prisma.rbac_user_roles.create({ data: { user_id: userId, role_id: roleId } });
  }

  /** Delete the linked mobile-app account and clear the employee link. */
  async removeAppUser(id: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    if (emp.app_user_id) {
      await this.prisma.api_users.delete({ where: { user_id: emp.app_user_id } }).catch(() => null);
      await this.prisma.employees.update({ where: { id }, data: { app_user_id: null } });
    }
    return { success: true };
  }

  /** Convert an HR employee into a mobile-app user (api_users). Idempotent. */
  async convertToAppUser(id: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    if (!emp.phone) {
      throw new BadRequestException('لا يمكن إنشاء حساب تطبيق بدون رقم جوال');
    }

    if (emp.app_user_id) {
      const existing = await this.prisma.api_users.findUnique({
        where: { user_id: emp.app_user_id },
      });
      if (existing) {
        return { appUserId: existing.user_id, phone: existing.user_phone, alreadyExists: true };
      }
    }

    const phoneTaken = await this.prisma.api_users.findFirst({ where: { user_phone: emp.phone } });
    if (phoneTaken) {
      const owner = await this.prisma.employees.findFirst({ where: { app_user_id: phoneTaken.user_id } });
      if (owner && owner.id !== id) {
        throw new ConflictException('رقم الجوال مُستخدم لحساب تطبيق موظف آخر');
      }
    }

    const loginTaken = await this.prisma.users.findFirst({ where: { username: emp.phone } });
    if (loginTaken && loginTaken.emp_code !== id) {
      throw new ConflictException('رقم الجوال مُستخدم لحساب دخول موظف آخر');
    }

    const plainPassword = randomBytes(9).toString('base64url');
    const user_pass = await bcrypt.hash(plainPassword, 12);

    const appUser = await this.prisma.api_users.create({
      data: {
        user_name: emp.employee ?? emp.phone,
        user_phone: emp.phone,
        user_email: emp.email ?? null,
        user_city: null,
        user_pass,
        status: 1,
      },
    });

    await this.prisma.employees.update({
      where: { id },
      data: { app_user_id: appUser.user_id },
    });

    return {
      appUserId: appUser.user_id,
      phone: appUser.user_phone,
      password: plainPassword,
      alreadyExists: false,
    };
  }

  async setStatus(id: number, employeeType: number) {
    await this.prisma.employees.update({ where: { id }, data: { employee_type: employeeType } });
    return { id, employee_type: employeeType };
  }

  /** Soft delete (recoverable) — better than the legacy hard delete. */
  async remove(id: number) {
    await this.prisma.employees.update({ where: { id }, data: { leave_emp: 1 } });
    return { id };
  }

  // ---- Finance (allowances / deductions + basic salary) ----
  async getFinance(id: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true, basic_salary: true } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const rows = await this.prisma.hr_finance_employes.findMany({ where: { emp_id: id } });
    return {
      basic_salary: emp.basic_salary?.toString() ?? '',
      rows: rows.map((r) => ({
        id: String(r.id),
        badl_type: String(r.badl_type) as '1' | '2',
        badl_discount_id_fk: String(r.badl_discount_id_fk),
        value: String(r.value),
        method_to_count: METHOD_FROM_NUM[r.method_to_count] ?? 'fixed',
        date_from: r.date_from ?? '',
        date_to: r.date_to ?? '',
        insurance_affect: r.insurance_affect === 1,
      })),
    };
  }

  async putFinance(id: number, body: { rows?: any[]; basic_salary?: string }, userId?: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const empCode = emp.emp_code ?? 0;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const basicSalary = Number(String(body.basic_salary ?? '').trim());
    if (!Number.isFinite(basicSalary) || basicSalary <= 0) {
      throw new BadRequestException('الراتب الأساسي يجب أن يكون رقمًا أكبر من صفر');
    }

    // Running totals (denormalized on every row, legacy parity):
    //  having_all_value   = Σ allowance values (badl_type 1)
    //  discut_all_value   = Σ deduction values (badl_type 2)
    //  having_tamin_value = Σ values of insurance-affecting allowances
    let havingAll = 0;
    let discutAll = 0;
    let havingTamin = 0;
    for (const r of rows) {
      const v = Number(r.value) || 0;
      const t = Number(r.badl_type) || 1;
      const aff = r.insurance_affect === true || r.insurance_affect === 1 || r.insurance_affect === '1';
      if (t === 1) {
        havingAll += v;
        if (aff) havingTamin += v;
      } else if (t === 2) {
        discutAll += v;
      }
    }

    await this.prisma.$transaction([
      this.prisma.employees.update({
        where: { id },
        data: { basic_salary: basicSalary },
      }),
      this.prisma.hr_finance_employes.deleteMany({ where: { emp_id: id } }),
      this.prisma.hr_finance_employes.createMany({
        data: rows.map((r) => {
          const badlId = Number(r.badl_discount_id_fk) || 0;
          return {
            emp_id: id,
            emp_code: empCode,
            badl_discount_id_fk: badlId,
            // legacy badal_code came from emp_badlat_discount_settings (absent in
            // new schema); the catalog id is the code here.
            badl_code: badlId || null,
            badl_type: Number(r.badl_type) || 1,
            value: Number(r.value) || 0,
            method_to_count: METHOD_TO_NUM[r.method_to_count as string] ?? 1,
            specific_period: r.date_from ? '1' : '0',
            date_from: r.date_from || null,
            date_to: r.date_to || null,
            insurance_affect:
              r.insurance_affect === true || r.insurance_affect === 1 || r.insurance_affect === '1' ? 1 : 0,
            having_all_value: havingAll,
            discut_all_value: discutAll,
            having_tamin_value: havingTamin,
            publisher: userId ?? null,
          };
        }),
      }),
    ]);
    return { id, count: rows.length };
  }

  /**
   * Delete a single finance row and recompute the denormalized running totals
   * on the employee's remaining rows. Faithful port of
   * Finance_employee_model::delete_badl — subtracts the deleted row's value
   * from having_all_value (type 1) or discut_all_value (type 2). When the
   * deleted allowance affected insurance, having_tamin_value is decremented too.
   */
  async deleteFinanceRow(empId: number, rowId: number) {
    const row = await this.prisma.hr_finance_employes.findFirst({
      where: { id: rowId, emp_id: empId },
    });
    if (!row) throw new NotFoundException('البند غير موجود');
    const empCode = row.emp_code;
    const value = row.value ?? 0;
    const type = row.badl_type;
    const affectedTamin = row.insurance_affect === 1;

    await this.prisma.hr_finance_employes.delete({ where: { id: rowId } });

    // Read a surviving row to get the current running totals (legacy get_new_value).
    const surviving = await this.prisma.hr_finance_employes.findFirst({ where: { emp_code: empCode } });
    if (!surviving) return { id: empId, deleted: rowId };

    const data: Prisma.hr_finance_employesUpdateManyMutationInput = {};
    if (type === 1) {
      data.having_all_value = Number(surviving.having_all_value ?? 0) - Number(value);
      if (affectedTamin) {
        data.having_tamin_value = Number(surviving.having_tamin_value ?? 0) - Number(value);
      }
    } else if (type === 2) {
      data.discut_all_value = Number(surviving.discut_all_value ?? 0) - Number(value);
    }
    if (Object.keys(data).length) {
      await this.prisma.hr_finance_employes.updateMany({ where: { emp_code: empCode }, data });
    }
    return { id: empId, deleted: rowId };
  }

  // ---- Dwam (work schedule) ----
  async getDwam(id: number) {
    const row = await this.prisma.hr_emp_dwam.findFirst({ where: { emp_id: id } });
    const schedule = Object.entries(DAY_COL).map(([day, col]) => ({
      day: Number(day),
      enabled: row ? (row[col] as number) === 1 : false,
      startTime: row?.attend_time ?? '08:00',
      endTime: row?.leave_time ?? '17:00',
    }));
    return { shift_type: shiftTypeToLabel(row?.always_id_fk), schedule };
  }

  async putDwam(id: number, body: { schedule?: any[]; shift_type?: string }) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const schedule = Array.isArray(body.schedule) ? body.schedule : [];
    const flags: Record<string, number> = { saturday: 0, sunday: 0, monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 };
    let attend = '08:00';
    let leave = '17:00';
    for (const d of schedule) {
      const col = DAY_COL[Number(d.day)];
      if (col) flags[col] = d.enabled ? 1 : 0;
      if (d.enabled && d.startTime) {
        attend = d.startTime;
        leave = d.endTime ?? leave;
      }
    }
    const shiftCode = body.shift_type != null ? parseShiftType(body.shift_type) : 0;
    const base = {
      emp_code: String(emp.emp_code ?? ''),
      always_id_fk: shiftCode,
      period_id_fk: 0,
      attend_time: attend,
      leave_time: leave,
      ...flags,
    };
    const existing = await this.prisma.hr_emp_dwam.findFirst({ where: { emp_id: id } });
    if (existing) {
      await this.prisma.hr_emp_dwam.update({ where: { id: existing.id }, data: base });
    } else {
      await this.prisma.hr_emp_dwam.create({
        data: {
          emp_id: id,
          ...base,
          // legacy NOT-NULL columns without defaults
          start_enter: '',
          end_enter: '',
          start_out: '',
          end_out: '',
          from_date: 0,
          from_date_ar: '',
          to_date: 0,
          to_date_ar: '',
        },
      });
    }
    return { id };
  }

  // ---- Read-only sub-resources for the profile tabs ----
  async getBanks(id: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true } });
    if (!emp?.emp_code) return [];
    return this.prisma.bank_employes_details.findMany({ where: { emp_code: emp.emp_code } });
  }

  async putBanks(
    id: number,
    body: {
      rows?: Array<{
        bank_id_fk: number;
        bank_account_num: string;
        bank_code?: string;
        approved_for_sarf?: number | boolean;
        emp_bank_name?: string;
        bank_id_fk_image?: string;
      }>;
    },
  ) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const empCode = emp.emp_code ?? 0;
    const rows = Array.isArray(body.rows) ? body.rows : [];

    await this.prisma.$transaction([
      this.prisma.bank_employes_details.deleteMany({ where: { emp_code: empCode } }),
      ...(rows.length
        ? [
            this.prisma.bank_employes_details.createMany({
              data: rows.map((r) => ({
                emp_code: empCode,
                bank_id_fk: Number(r.bank_id_fk) || 0,
                bank_account_num: String(r.bank_account_num ?? '0'),
                bank_code: r.bank_code ?? null,
                approved_for_sarf: r.approved_for_sarf === true || r.approved_for_sarf === 1 ? 1 : 0,
                emp_bank_name: r.emp_bank_name ?? null,
                bank_id_fk_image: r.bank_id_fk_image ?? null,
              })),
            }),
          ]
        : []),
    ]);

    return { id, count: rows.length };
  }

  async getContract(id: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true } });
    if (!emp?.emp_code) return null;
    return this.prisma.contract_employe.findFirst({ where: { emp_code: String(emp.emp_code) } });
  }

  private static CONTRACT_STR = [
    'num_days_in_month', 'hours_work', 'hour_value', 'work_period_id_fk', 'job_type',
    'pay_method_id_fk', 'bank_id_fk', 'bank_code', 'bank_account_num', 'year_vacation_num',
    'year_vacation_period', 'casual_vacation_num', 'travel_ticket', 'travel_type_fk',
    'travel_period', 'vacation_start_ar', 'vacation_start_m', 'vacation_start_h', 'travel_type_name',
  ];
  private static CONTRACT_NUM = ['contract_nature', 'reward_end_work', 'vacation_previous_balance'];

  /** Create or update the employment contract (contract_employe) — the previously read-only tab. */
  async putContract(id: number, body: Record<string, unknown>) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true } });
    if (!emp?.emp_code) throw new NotFoundException('الموظف غير موجود');
    const empCode = String(emp.emp_code);

    const data: Record<string, unknown> = {};
    for (const k of EmployeesService.CONTRACT_STR) if (body[k] != null) data[k] = String(body[k]);
    for (const k of EmployeesService.CONTRACT_NUM) if (body[k] != null) data[k] = Number(body[k]);

    const existing = await this.prisma.contract_employe.findFirst({ where: { emp_code: empCode } });
    if (existing) {
      return this.prisma.contract_employe.update({ where: { id: existing.id }, data: data as never });
    }
    return this.prisma.contract_employe.create({
      data: {
        emp_code: empCode,
        vacation_previous_balance: 0,
        vacation_start_ar: '',
        ...data,
      } as never,
    });
  }

  async getDocuments(id: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true } });
    return this.prisma.emp_files.findMany({
      where: { OR: [{ emp_id: id }, ...(emp?.emp_code ? [{ emp_code: String(emp.emp_code) }] : [])] },
      orderBy: { id: 'desc' },
    });
  }

  async putDocuments(
    id: number,
    body: {
      rows?: Array<{
        id?: number;
        file_type?: string;
        file_name?: string;
        file_path?: string;
        expire_date?: string;
      }>;
    },
  ) {
    const emp = await this.prisma.employees.findUnique({ where: { id }, select: { emp_code: true } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const empCode = String(emp.emp_code ?? '0');

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const r of rows) {
      const data = {
        emp_id: id,
        emp_code: empCode,
        title: r.file_type ?? r.file_name ?? '',
        emp_file: r.file_path ?? '',
        to_date: r.expire_date ?? null,
        have_date: r.expire_date ? 1 : 0,
      };
      const rowId = r.id != null ? Number(r.id) : NaN;
      if (!Number.isNaN(rowId) && rowId > 0) {
        const existing = await this.prisma.emp_files.findFirst({ where: { id: rowId, emp_id: id } });
        if (existing) {
          ops.push(this.prisma.emp_files.update({ where: { id: rowId }, data }));
        } else {
          ops.push(this.prisma.emp_files.create({ data }));
        }
      } else {
        ops.push(this.prisma.emp_files.create({ data }));
      }
    }

    if (ops.length) await this.prisma.$transaction(ops);
    return { id, count: rows.length };
  }

  async getInsurance(id: number) {
    const e = await this.prisma.employees.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('الموظف غير موجود');
    return {
      tamin_rkm: e.tamin_rkm,
      type_tamin: e.type_tamin,
      tamin_mosama_wazefy: e.tamin_mosama_wazefy,
      tamin_rateb: e.tamin_rateb?.toString() ?? null,
      tamin_hesa_emp: e.tamin_hesa_emp?.toString() ?? null,
      tamin_hesa_oner: e.tamin_hesa_oner?.toString() ?? null,
      tamin_company: e.tamin_company,
      type_tamin__medicine: e.type_tamin__medicine,
      tamin_medicine_num: e.tamin_medicine_num,
      polica_num: e.polica_num,
      start_tamin_date_m: e.start_tamin_date_m,
      tamin_date_m: e.tamin_date_m,
    };
  }
}
