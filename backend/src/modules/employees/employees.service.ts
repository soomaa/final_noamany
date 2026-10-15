import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import {
  parseShiftType,
  shiftTypeToLabel,
} from "../../common/constants/shift-type.util";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { paginated } from "../../common/dto/list-result";
import { formToData, rowToForm } from "./employees.fieldmap";
import {
  resolveAdditionalSalesRoleId,
  resolveRoleIdForJobTitleId,
  syncAdditionalSalesRole,
  syncEmployeeUserRole,
} from "../rbac/job-title-role.util";
import { PermissionEngineService } from "../rbac/engine/permission-engine.service";
import {
  resolveSettingsIdsToTitles,
  resolveSettingsTitlesToIds,
} from "./employees.lookup-resolver";
import {
  isMarketingRepJobTitle,
  marketingRepEmployeeWhere,
  marketingRepJobTitleWhere,
} from "./marketing-rep.util";
import { cairoDateString } from "../../common/utils/cairo-date";
import { resolveEngineBadlCode } from "../payroll/salary-component.util";
import { markEmployeeExited, restoreEmployee } from "./employee-exit.util";
import { HrDataScopeService } from "../../common/hr-scope/hr-data-scope.service";
import { JwtUser } from "../../common/types/jwt-user";
import { claimEmployeePrivateFile } from "../uploads/private-file-reference.util";
import {
  claimAcceptedRecruitmentApplication,
  completeRecruitmentConversion,
} from "../job-requests/recruitment-conversion.util";
import {
  DisabledWorkforceAdapter,
  WORKFORCE_ADAPTER,
  WorkforceAdapter,
} from "../../ports/workforce/workforce.adapter";

const DAY_COL: Record<
  number,
  | "saturday"
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
> = {
  6: "saturday",
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
};
const METHOD_TO_NUM: Record<string, number> = { fixed: 1, percent: 2, days: 3 };
const METHOD_FROM_NUM: Record<number, string> = {
  1: "fixed",
  2: "percent",
  3: "days",
};

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionEngine: PermissionEngineService,
    private readonly hrScope: HrDataScopeService,
    @Optional() @Inject(WORKFORCE_ADAPTER)
    private readonly workforce: WorkforceAdapter = new DisabledWorkforceAdapter(),
  ) {}

  async list(
    q: PaginationDto & {
      branch?: string;
      edara?: string;
      gender?: string;
      emp_type?: string;
      status?: string;
    },
    user: JwtUser,
  ) {
    const resigned = q.status === "resigned" || q.status === "left";
    const where: Prisma.employeesWhereInput = resigned
      ? { leave_emp: 1 }
      : { OR: [{ leave_emp: null }, { leave_emp: 0 }] };
    const and: Prisma.employeesWhereInput[] = [];
    and.push(await this.hrScope.employeeWhere(user));

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
    if (q.branch && q.branch !== "all") {
      const branchId = Number(q.branch);
      if (Number.isFinite(branchId)) and.push({ branch_id_fk: branchId });
    }
    if (q.edara && q.edara !== "all") {
      const edaraId = Number(q.edara);
      if (Number.isFinite(edaraId)) and.push({ edara_id: edaraId });
    }
    if (q.gender && q.gender !== "all") {
      const gender = Number(q.gender);
      if (Number.isFinite(gender)) and.push({ gender });
    }
    if (q.emp_type && q.emp_type !== "all") {
      const empType = Number(q.emp_type);
      if (Number.isFinite(empType)) and.push({ emp_type: empType });
    }
    // Skip non-numeric status (e.g. resigned/left already handled) — Number('resigned') is NaN and breaks Prisma.
    if (q.status && q.status !== "all" && !resigned) {
      const employeeType = Number(q.status);
      if (Number.isFinite(employeeType))
        and.push({ employee_type: employeeType });
    }
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
          leave_emp: true,
          end_service_date_m: true,
        },
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.employees.count({ where }),
    ]);
    return paginated(rows, total, q.page, q.pageSize);
  }

  /**
   * Next emp_code. Faithful port of Human_resources::get_next_emp_code:
   * when an edara (department) is given, the code is drawn from that edara's
   * configured range (hr_edarat_aqsam.from_code..to_code). next = MAX(emp_code)
   * within [from..to] for that edara + 1, or from_code if none exist yet.
   * Throws "exceeded range" when the range is full. Falls back to the global
   * MAX+1 when no edara is supplied (legacy add-form default).
   */
  async nextCode(
    edaraId?: number,
  ): Promise<{ nextCode: number; status: string }> {
    if (!edaraId) {
      const max = await this.prisma.employees.aggregate({
        _max: { emp_code: true },
      });
      return { nextCode: (max._max.emp_code ?? 1000) + 1, status: "ok" };
    }

    const edara = await this.prisma.hr_edarat_aqsam.findUnique({
      where: { id: edaraId },
    });
    if (!edara || edara.from_code == null || edara.to_code == null) {
      throw new BadRequestException("بيانات ناقصة");
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
        throw new BadRequestException(
          "تم الوصول إلى الحد الأقصى للأكواد في هذه الإدارة",
        );
      }
    }
    return { nextCode, status: "ok" };
  }

  /** Edit form prefill — DB row reverse-mapped to the form's field names. */
  async findForForm(id: number) {
    const row = await this.prisma.employees.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("الموظف غير موجود");
    const form = rowToForm(row as unknown as Record<string, unknown>);
    const resolved = await resolveSettingsTitlesToIds(this.prisma, form);
    if (row.mosma_wazefy_code)
      resolved.job_title_id_fk = String(row.mosma_wazefy_code);
    const loginUser = await this.prisma.users.findFirst({
      where: { emp_code: id },
      select: { role_id_fk: true, user_id: true, username: true },
    });
    if (loginUser) {
      resolved.addToSystem = "true";
      resolved.systemUsername = loginUser.username ?? "";
    } else {
      resolved.addToSystem = "false";
    }
    Object.assign(resolved, await this.workforce.employeeFormFields(id));
    return { id: row.id, ...resolved };
  }

  /** Profile view — raw columns (the profile page reads these directly). */
  async profile(id: number) {
    const row = await this.prisma.employees.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("الموظف غير موجود");
    return row;
  }

  /**
   * Server-side validation mirroring the legacy add_employee_new /
   * update_employee form_validation rules (required: edara, qsm, emp_code,
   * name, branch, jwal, emp_type) + phone format. Arabic messages.
   * `isEdit` relaxes emp_code (the business key is not reassigned on edit).
   */
  private validateEmployeeBody(body: Record<string, unknown>, isEdit = false) {
    const str = (v: unknown) => String(v ?? "").trim();
    const required: Array<[string, string]> = [
      ["job_title_id_fk", "المسمى الوظيفي"],
      ["employment_type", "نوع العقد"],
      ["emp_name", "اسم الموظف"],
      ["branch_id_fk", "الفرع"],
      ["jwal", "رقم الجوال"],
      ["emp_type", "النوع (رجالى/حريمى)"],
      ["basic_salary", "الراتب الأساسي"],
    ];
    if (!isEdit) required.push(["emp_code", "كود الموظف"]);
    for (const [field, label] of required) {
      if (str(body[field]) === "")
        throw new BadRequestException(`${label} حقل مطلوب`);
    }
    // Phone format: Egyptian mobile (01xxxxxxxxx) or international digits (9–15).
    const phone = str(body.jwal);
    if (phone !== "" && !/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ""))) {
      throw new BadRequestException("رقم الجوال غير صحيح");
    }
    const basicSalary = Number(str(body.basic_salary));
    if (!Number.isFinite(basicSalary) || basicSalary <= 0) {
      throw new BadRequestException(
        "الراتب الأساسي يجب أن يكون رقمًا أكبر من صفر",
      );
    }
  }

  /** date_ar (Y-m-d) + date_s (unix epoch as string) mirrors + publisher stamp. */
  private dualDateStamps(userId?: number): Record<string, unknown> {
    const now = new Date();
    const dateAr = cairoDateString(now); // Cairo business date (legacy date('Y-m-d'))
    const dateS = String(Math.floor(now.getTime() / 1000)); // strtotime() epoch
    return { date_ar: dateAr, date_s: dateS, publisher: userId ?? null };
  }

  async create(body: Record<string, unknown>, userId?: number) {
    this.validateEmployeeBody(body, false);
    const recruitmentRaw = body.recruitmentApplicationId;
    const recruitmentApplicationId =
      recruitmentRaw == null || recruitmentRaw === ""
        ? null
        : Number(recruitmentRaw);
    if (
      recruitmentApplicationId != null &&
      (!Number.isInteger(recruitmentApplicationId) ||
        recruitmentApplicationId < 1)
    ) {
      throw new BadRequestException("رقم طلب التوظيف غير صالح");
    }
    const resolvedBody = await this.applyJobTitle(
      await resolveSettingsIdsToTitles(this.prisma, body),
    );
    const data = formToData(resolvedBody);
    const shouldProvision = this.parseAddToSystem(body);
    const additionalSalesRoleId = shouldProvision && data.is_sales === true
      ? await resolveAdditionalSalesRoleId(this.prisma)
      : undefined;
    const provisionRoleId = shouldProvision
      ? await this.resolveRoleIdForJobTitle(resolvedBody)
      : undefined;
    if (provisionRoleId != null) {
      await this.assertCanAssignRole(userId, undefined, provisionRoleId, true);
    }
    if (additionalSalesRoleId != null) {
      await this.assertCanAssignRole(userId, undefined, additionalSalesRoleId, true);
    }
    const provisionCredentials = shouldProvision
      ? this.parseSystemCredentials(body, (data.phone as string) ?? "", true)
      : undefined;
    if (shouldProvision && provisionCredentials) {
      await this.preflightProvisionUser(
        null,
        (data.phone as string) ?? "",
        provisionCredentials,
      );
    }

    // Manual emp_code: reject duplicates up-front.
    if (data.emp_code != null) {
      const dup = await this.prisma.employees.findFirst({
        where: { emp_code: data.emp_code as number },
      });
      if (dup) throw new BadRequestException("كود الموظف مُستخدم مسبقًا");
    }

    const buildData = (): Prisma.employeesCreateInput =>
      ({
        ...data,
        ...this.dualDateStamps(userId),
        neqat_total: 7000, // legacy new-flow seed
        demo_card: (data.demo_card as string) ?? "",
        shahadt_jaish: (data.shahadt_jaish as "yes" | "no") ?? "no",
        tamin_rkm: (data.tamin_rkm as number) ?? 0,
        khedma_year: 0,
        age: (data.age as number) ?? 0,
      }) as Prisma.employeesCreateInput;

    // Serialize both automatic and manual business codes on the same stable
    // InnoDB sentinel used by account identity writers. The row lock is held by
    // MySQL until COMMIT, unlike a named lock released inside Prisma's callback.
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 ORDER BY user_id LIMIT 1 FOR UPDATE`;
      if (recruitmentApplicationId != null) {
        await claimAcceptedRecruitmentApplication(
          tx,
          recruitmentApplicationId,
          String(body.card_num ?? ""),
        );
      }
      const finalizeRecruitment = async <T extends { id: number }>(
        row: T,
      ): Promise<T> => {
        if (recruitmentApplicationId != null) {
          await completeRecruitmentConversion(
            tx,
            recruitmentApplicationId,
            row.id,
          );
          await tx.business_audit_log.create({
            data: {
              entity_type: "recruitment_application",
              entity_id: String(recruitmentApplicationId),
              action: "applicant.converted_to_employee",
              actor_user_id: userId ?? null,
              after_json: { employeeId: row.id },
              changed_fields: ["pipelineStatus", "convertedEmployeeId"],
            },
          });
        }
        return row;
      };
      if (data.emp_code == null) {
        const max = await tx.employees.aggregate({ _max: { emp_code: true } });
        const createData = buildData();
        createData.emp_code = (max._max.emp_code ?? 1000) + 1;
        const row = await tx.employees.create({ data: createData });
        await claimEmployeePrivateFile(
          tx,
          createData.personal_photo,
          row.id,
          userId,
          ["emp-photo"],
        );
        if (shouldProvision) {
          await this.provisionUser(
            row.id,
            (data.employee as string) ?? "",
            (data.phone as string) ?? "",
            (data.branch_id_fk as number) ?? null,
            provisionRoleId,
            undefined,
            provisionCredentials,
            tx,
          );
        }
        return finalizeRecruitment(row);
      }
      const duplicateCode = await tx.employees.findFirst({
        where: { emp_code: data.emp_code as number },
        select: { id: true },
      });
      if (duplicateCode)
        throw new BadRequestException("كود الموظف مُستخدم مسبقًا");
      const row = await tx.employees.create({ data: buildData() });
      await claimEmployeePrivateFile(tx, data.personal_photo, row.id, userId, [
        "emp-photo",
      ]);
      if (shouldProvision) {
        await this.provisionUser(
          row.id,
          (data.employee as string) ?? "",
          (data.phone as string) ?? "",
          (data.branch_id_fk as number) ?? null,
          provisionRoleId,
          undefined,
          provisionCredentials,
          tx,
        );
      }
      return finalizeRecruitment(row);
    });

    if (shouldProvision) {
      const createdLogin = await this.prisma.users.findFirst({
        where: { emp_code: created.id },
        select: { user_id: true },
      });
      if (createdLogin)
        this.permissionEngine.invalidateUser(createdLogin.user_id);
    }

    await this.workforce.syncEmployee(created.id, body);

    return { id: created.id, emp_code: created.emp_code };
  }

  /** Active personal-sales specialists used by CRM assignment and target screens. */
  async salesReps(options: { includeInactive?: boolean } = {}) {
    const marketingJobs = await this.prisma.department_jobs.findMany({
      where: marketingRepJobTitleWhere,
      select: { id: true },
    });
    const rows = await this.prisma.employees.findMany({
      where: {
        AND: [
          { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
          { employee_type: 1 },
          marketingRepEmployeeWhere(marketingJobs.map((job) => job.id)),
        ],
      },
      select: { id: true, employee: true, emp_code: true, branch_id_fk: true },
      orderBy: { employee: "asc" },
    });
    const ids = rows.map((row) => row.id);
    const [settings, branchRows] = ids.length
      ? await Promise.all([
          this.prisma.club_sales_rep_settings.findMany({
            where: { employee_id: { in: ids } },
            select: { employee_id: true, is_active: true },
          }),
          this.prisma.club_sales_rep_branches.findMany({
            where: { employee_id: { in: ids } },
            select: { employee_id: true, branch_id: true },
          }),
        ])
      : [[], []];
    const activeById = new Map(settings.map((row) => [row.employee_id, row.is_active]));
    const branchesById = new Map<number, number[]>();
    branchRows.forEach((row) => branchesById.set(row.employee_id, [...(branchesById.get(row.employee_id) ?? []), row.branch_id]));
    return rows.map((row) => {
      const explicitBranches = branchesById.get(row.id) ?? [];
      const branchIds = explicitBranches.length
        ? explicitBranches
        : row.branch_id_fk != null ? [row.branch_id_fk] : [];
      return {
        id: row.id,
        name: row.employee,
        empCode: row.emp_code,
        branchId: row.branch_id_fk,
        branchIds,
        isActive: activeById.get(row.id) ?? true,
      };
    }).filter((row) => options.includeInactive || row.isActive);
  }

  /** Whether the signed-in employee belongs to the personal-sales workforce. */
  async isSalesEmployee(userEmpId: number | null): Promise<boolean> {
    if (!userEmpId) return false;
    const employee = await this.prisma.employees.findUnique({
      where: { id: userEmpId },
      select: { mosma_wazefy_code: true, mosma_wazefy_n: true, is_sales: true },
    });
    if (!employee) return false;
    if (employee.is_sales || isMarketingRepJobTitle(employee.mosma_wazefy_n)) return true;
    if (!employee.mosma_wazefy_code) return false;
    const job = await this.prisma.department_jobs.findUnique({
      where: { id: employee.mosma_wazefy_code },
      select: { name: true },
    });
    return isMarketingRepJobTitle(job?.name);
  }

  private parseAddToSystem(body: Record<string, unknown>): boolean {
    const raw = body.addToSystem ?? body.add_to_system;
    return raw === true || raw === "true" || raw === 1 || raw === "1";
  }

  private parseSystemCredentials(
    body: Record<string, unknown>,
    phone: string,
    requirePassword = true,
  ): { username: string; password?: string } {
    const username = String(body.systemUsername ?? body.username ?? "").trim();
    const password = String(body.systemPassword ?? body.password ?? "").trim();
    if (!username)
      throw new BadRequestException(
        "اسم المستخدم مطلوب عند إضافة الموظف للنظام",
      );
    if (requirePassword && !password) {
      throw new BadRequestException(
        "كلمة المرور مطلوبة عند إضافة الموظف للنظام",
      );
    }
    return { username, password: password || undefined };
  }

  /**
   * `employees` is a legacy MyISAM table, so its write cannot be rolled back if
   * account provisioning later rejects a duplicate. Run all deterministic
   * ownership checks before touching that row; provisionUser repeats them to
   * defend against a concurrent change.
   */
  private async preflightProvisionUser(
    employeeId: number | null,
    phone: string,
    credentials: { username: string; password?: string },
  ) {
    const username = credentials.username.trim() || phone;
    const otherEmp = await this.prisma.employees.findFirst({
      where: {
        phone,
        ...(employeeId != null ? { id: { not: employeeId } } : {}),
      },
      select: { id: true, employee: true },
    });
    if (otherEmp) {
      throw new ConflictException(
        `رقم الجوال مُستخدم لموظف آخر: ${otherEmp.employee ?? otherEmp.id}`,
      );
    }

    const dupApp = await this.prisma.api_users.findFirst({
      where: { user_phone: phone },
    });
    const linkedAppEmployee = dupApp
      ? await this.prisma.employees.findFirst({
          where: { app_user_id: dupApp.user_id },
          select: { id: true },
        })
      : null;
    if (linkedAppEmployee && linkedAppEmployee.id !== employeeId) {
      throw new ConflictException("رقم الجوال مُستخدم لحساب تطبيق موظف آخر");
    }

    const linkedUser =
      employeeId != null
        ? await this.prisma.users.findFirst({
            where: { emp_code: employeeId },
            select: { user_id: true },
          })
        : null;
    const conflictingUser = await this.prisma.users.findFirst({
      where: {
        // Staff authentication uses the saved username, not a separate phone
        // alias. Phone ownership was checked against employees/app users above.
        username,
        ...(linkedUser ? { user_id: { not: linkedUser.user_id } } : {}),
      },
      select: { user_id: true },
    });
    if (conflictingUser) {
      throw new ConflictException(
        "اسم المستخدم مستخدم لحساب نظام آخر",
      );
    }
  }

  private async applyJobTitle(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const raw = body.job_title_id_fk ?? body.mosma_wazefy_code;
    if (raw == null || raw === "") return body;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return body;
    const job = await this.prisma.department_jobs.findUnique({ where: { id } });
    if (!job) throw new BadRequestException("المسمى الوظيفي المحدد غير موجود");
    return {
      ...body,
      job_title_id_fk: String(id),
      mosma_wazefy_code: String(id),
      mosma_wazefy_n: job.name,
    };
  }

  /** Map job title → RBAC role (1:1 linked role per المسمى الوظيفي). */
  private async resolveRoleIdForJobTitle(
    body: Record<string, unknown>,
  ): Promise<number> {
    const raw = body.job_title_id_fk ?? body.mosma_wazefy_code;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException("المسمى الوظيفي مطلوب لربط صلاحيات النظام");
    }
    return resolveRoleIdForJobTitleId(this.prisma, id);
  }

  /** Extract an optional RBAC roleId from a raw employee form body (legacy override). */
  private parseRoleId(body: Record<string, unknown>): number | undefined {
    const raw = body.roleId ?? body.role_id ?? body.role_id_fk;
    if (raw == null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  async update(id: number, body: Record<string, unknown>, userId?: number) {
    const existing = await this.prisma.employees.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("الموظف غير موجود");
    this.validateEmployeeBody(body, true);
    const resolvedBody = await this.applyJobTitle(
      await resolveSettingsIdsToTitles(this.prisma, body),
    );
    const data = formToData(resolvedBody);
    delete data.emp_code; // never reassign the business key on edit
    const linkedUser = await this.prisma.users.findFirst({
      where: { emp_code: id },
      select: { user_id: true, role_id_fk: true },
    });
    const targetJobTitleId = Number(
      data.mosma_wazefy_code ?? existing.mosma_wazefy_code,
    );
    const targetRoleId =
      Number.isFinite(targetJobTitleId) && targetJobTitleId > 0
        ? await resolveRoleIdForJobTitleId(this.prisma, targetJobTitleId)
        : undefined;
    const targetAlreadyAssigned =
      linkedUser && targetRoleId != null
        ? (await this.prisma.rbac_user_roles.count({
            where: { user_id: linkedUser.user_id, role_id: targetRoleId },
          })) > 0
        : false;
    const shouldProvision = this.parseAddToSystem(body);
    if (targetRoleId != null && (linkedUser || this.parseAddToSystem(body))) {
      const assignmentChanges =
        !linkedUser ||
        linkedUser.role_id_fk !== targetRoleId ||
        !targetAlreadyAssigned;
      await this.assertCanAssignRole(
        userId,
        linkedUser?.user_id,
        targetRoleId,
        assignmentChanges,
      );
    }
    const targetIsSales = data.is_sales == null ? existing.is_sales : data.is_sales === true;
    if (targetIsSales && (linkedUser || shouldProvision)) {
      const additionalSalesRoleId = await resolveAdditionalSalesRoleId(this.prisma);
      const salesRoleAssigned = linkedUser
        ? (await this.prisma.rbac_user_roles.count({
            where: { user_id: linkedUser.user_id, role_id: additionalSalesRoleId },
          })) > 0
        : false;
      await this.assertCanAssignRole(
        userId,
        linkedUser?.user_id,
        additionalSalesRoleId,
        !salesRoleAssigned,
      );
    }
    const newPhone = (data.phone as string) ?? existing.phone ?? "";
    const credentials = shouldProvision
      ? this.parseSystemCredentials(body, newPhone, false)
      : undefined;
    if (shouldProvision && credentials) {
      await this.preflightProvisionUser(id, newPhone, credentials);
    }
    await this.prisma.$transaction(async (tx) => {
      await claimEmployeePrivateFile(tx, data.personal_photo, id, userId, [
        "emp-photo",
      ]);
      await tx.employees.update({
        where: { id },
        data: { ...data, ...this.dualDateStamps(userId) },
      });

      if (data.personal_photo != null) {
        const photo = String(data.personal_photo).trim();
        if (linkedUser && photo && photo !== "0") {
          await tx.users.update({
            where: { user_id: linkedUser.user_id },
            data: { image: photo },
          });
        }
      }

      if (shouldProvision) {
        await this.provisionUser(
          id,
          (data.employee as string) ?? existing.employee ?? "",
          newPhone,
          (data.branch_id_fk as number) ?? existing.branch_id_fk ?? null,
          targetRoleId,
          existing.phone ?? undefined,
          credentials,
          tx,
        );
      } else {
        await syncEmployeeUserRole(tx, id);
        await syncAdditionalSalesRole(tx, id);
      }
    });

    const syncedLogin = await this.prisma.users.findFirst({
      where: { emp_code: id },
      select: { user_id: true },
    });
    if (syncedLogin) this.permissionEngine.invalidateUser(syncedLogin.user_id);

    await this.workforce.syncEmployee(id, body);
    return { id };
  }

  /**
   * Faithful port of Employee_model::add_users — create a level-2 login user keyed
   * to the employee. Permissions are resolved automatically from the job title (المسمى الوظيفي).
   * users.emp_code stores employees.id (legacy convention).
   *
   * Updates the account linked to this employee in place. An omitted password
   * preserves its current password; another account's username is never reused.
   */
  private async provisionUser(
    empId: number,
    name: string,
    phone: string,
    branchId: number | null,
    roleId?: number,
    previousPhone?: string,
    credentials?: { username: string; password?: string },
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    if (!phone && !credentials?.username) return;

    const empRow = await db.employees.findUnique({
      where: { id: empId },
      select: { personal_photo: true, mosma_wazefy_code: true },
    });
    const avatarFromEmp = empRow?.personal_photo?.trim();
    const avatarImage =
      avatarFromEmp && avatarFromEmp !== "0"
        ? avatarFromEmp
        : "user-20250803a67b668cca.png";

    const username = credentials?.username?.trim() || phone;
    const plainPassword =
      credentials?.password?.trim() || phone.replace(/\D/g, "") || phone;

    // Serialize every login identity writer on the same stable InnoDB row. The
    // legacy users table has no UNIQUE(username/emp_code), so a preflight alone
    // cannot stop two simultaneous employee provisions from creating duplicates.
    await db.$queryRaw`SELECT user_id FROM users WHERE level = 1 ORDER BY user_id LIMIT 1 FOR UPDATE`;

    // Block duplicate phone on another employee's app/login account.
    const otherEmp = await db.employees.findFirst({
      where: { phone, id: { not: empId } },
      select: { id: true, employee: true },
    });
    if (otherEmp) {
      throw new ConflictException(
        `رقم الجوال مُستخدم لموظف آخر: ${otherEmp.employee ?? otherEmp.id}`,
      );
    }

    const dupApp = await db.api_users.findFirst({
      where: { user_phone: phone },
    });
    const linkedEmp = await db.employees.findFirst({
      where: { app_user_id: dupApp?.user_id },
    });
    if (dupApp && linkedEmp && linkedEmp.id !== empId) {
      throw new ConflictException("رقم الجوال مُستخدم لحساب تطبيق موظف آخر");
    }

    // Resolve the account by its employee link first. A username/phone match alone is never
    // ownership proof: reassigning such a row could turn an employee edit into an account takeover.
    const linkedUser = await db.users.findFirst({ where: { emp_code: empId } });
    const conflictingUser = await db.users.findFirst({
      where: {
        // Match the preflight: reserve only the username that will be saved.
        username,
        ...(linkedUser ? { user_id: { not: linkedUser.user_id } } : {}),
      },
    });
    if (conflictingUser) {
      throw new ConflictException(
        "اسم المستخدم مستخدم لحساب نظام آخر",
      );
    }

    if (linkedUser) {
      await db.users.update({
        where: { user_id: linkedUser.user_id },
        data: {
          name,
          branch_id_fk: branchId,
          username,
          ...(credentials?.password ? { approved: 1 } : {}),
        },
      });
      if (avatarFromEmp) {
        await db.users.update({
          where: { user_id: linkedUser.user_id },
          data: { image: avatarFromEmp },
        });
      }
      if (credentials?.password) {
        const pwd = await bcrypt.hash(plainPassword, 12);
        await db.users.update({
          where: { user_id: linkedUser.user_id },
          data: {
            password: pwd,
            app_pass: null,
            pass_demo: null,
            user_pass: null,
            x_y_z: null,
          },
        });
      }
      if (roleId != null) {
        // Replace only the former job-title assignment while preserving manual
        // and temporary roles. A plain upsert used to keep the old job role too.
        await syncEmployeeUserRole(db, empId);
      } else {
        await syncEmployeeUserRole(db, empId);
      }
      await syncAdditionalSalesRole(db, empId);
      return;
    }

    const resolvedRoleId = roleId ?? (
      empRow?.mosma_wazefy_code
        ? await resolveRoleIdForJobTitleId(db, empRow.mosma_wazefy_code)
        : null
    );
    if (resolvedRoleId == null) throw new BadRequestException("يجب تحديد المسمى الوظيفي قبل إنشاء حساب التطبيق");

    const pwd = await bcrypt.hash(plainPassword, 12);
    const createdUser = await db.users.create({
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
        role_id_fk: resolvedRoleId,
        name,
        emp_code: empId,
        branch_id_fk: branchId,
      },
      select: { user_id: true },
    });
    await this.grantRbacRole(createdUser.user_id, resolvedRoleId, db);
    await syncAdditionalSalesRole(db, empId);
  }

  /**
   * Link an RBAC role to a login user so the permission engine grants its access.
   * Non-destructive (upsert on the unique user+role pair) and guarded: a non-existent
   * roleId is ignored rather than throwing an FK error mid employee-create.
   */
  private async grantRbacRole(
    userId: number,
    roleId: number,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const role = await db.rbac_roles.findUnique({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role) return;
    await db.rbac_user_roles.upsert({
      where: { user_id_role_id: { user_id: userId, role_id: roleId } },
      update: {},
      create: { user_id: userId, role_id: roleId },
    });
    this.permissionEngine.invalidateUser(userId);
  }

  /** Prevent delegated HR operators from assigning permissions above their own ceiling. */
  private async assertCanAssignRole(
    actorUserId: number | undefined,
    targetUserId: number | undefined,
    roleId: number,
    assignmentChanges: boolean,
  ) {
    if (!actorUserId)
      throw new ForbiddenException("تعذر التحقق من منفذ تغيير الصلاحيات");
    if (targetUserId === actorUserId && assignmentChanges) {
      throw new ForbiddenException(
        "لا يمكنك تغيير المسمى بما يعدل صلاحيات حسابك بنفسك",
      );
    }
    if (!assignmentChanges) return;

    const [actor, targetRole] = await Promise.all([
      this.permissionEngine.getEffective(actorUserId),
      this.permissionEngine.effectiveForRoleIds([roleId]),
    ]);
    if (targetRole.superAdmin && !actor.superAdmin) {
      throw new ForbiddenException(
        "إسناد دور المدير العام متاح للمدير العام فقط",
      );
    }
    if (!actor.superAdmin) {
      const missing = [...targetRole.keys].filter(
        (key) => !actor.keys.has(key),
      );
      if (missing.length) {
        throw new ForbiddenException(
          "لا يمكنك إسناد مسمى وظيفي يمنح صلاحيات لا تملكها",
        );
      }
    }
  }

  /** Delete the linked mobile-app account and clear the employee link. */
  async removeAppUser(id: number) {
    const disabledAppUser = await this.prisma.$transaction(
      async (
        tx,
      ): Promise<{ user_id: number; status: number | null } | null> => {
        // The legacy api_users table has no unique phone constraint. Serialize app
        // account writers on a stable InnoDB row and hold it until commit.
        await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 ORDER BY user_id LIMIT 1 FOR UPDATE`;
        const emp = await tx.employees.findUnique({ where: { id } });
        if (!emp) throw new NotFoundException("الموظف غير موجود");
        if (!emp.app_user_id) return null;

        // Mobile authentication uses the canonical staff `users` row, not the
        // legacy api_users compatibility table. Disable it and revoke every
        // refresh session in the same transaction before touching the legacy row.
        const canonicalUser = await tx.users.findFirst({
          where: { emp_code: id },
          select: { user_id: true },
        });
        if (canonicalUser) {
          await tx.users.update({
            where: { user_id: canonicalUser.user_id },
            data: { approved: 0 },
          });
          await tx.staff_auth_sessions.updateMany({
            where: { user_id: canonicalUser.user_id, revoked_at: null },
            data: { revoked_at: new Date(), revocation_reason: 'app-user-removed' },
          });
        }
        const appUser = await tx.api_users.findUnique({
          where: { user_id: emp.app_user_id },
        });
        if (appUser) {
          // Disable first so a failed physical cleanup never leaves an orphaned
          // account that can still authenticate.
          await tx.api_users.update({
            where: { user_id: appUser.user_id },
            data: { status: 0 },
          });
        }
        await tx.employees.update({
          where: { id },
          data: { app_user_id: null },
        });
        return appUser
          ? { user_id: appUser.user_id, status: appUser.status }
          : null;
      },
    );

    let legacyCleanupPending = false;
    if (disabledAppUser) {
      try {
        await this.prisma.api_users.delete({
          where: { user_id: disabledAppUser.user_id },
        });
      } catch {
        // api_users may be a legacy non-transactional table. Security state is
        // already fail-closed (canonical identity disabled, sessions revoked,
        // legacy row disabled, employee link cleared). Never compensate by
        // silently re-enabling a partially removed identity.
        legacyCleanupPending = true;
      }
    }
    return { success: true, ...(legacyCleanupPending ? { legacyCleanupPending } : {}) };
  }

  /** Convert an HR employee into a mobile self-service user. Idempotent. */
  async convertToAppUser(id: number) {
    const plainPassword = randomBytes(9).toString("base64url");
    const user_pass = await bcrypt.hash(plainPassword, 12);
    let createdAppUserId: number | null = null;
    let result: { appUserId: number; phone: string; alreadyExists: boolean };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT user_id FROM users WHERE level = 1 ORDER BY user_id LIMIT 1 FOR UPDATE`;
        const emp = await tx.employees.findUnique({ where: { id } });
        if (!emp) throw new NotFoundException("الموظف غير موجود");
        if (!emp.phone)
          throw new BadRequestException(
            "لا يمكن إنشاء حساب تطبيق بدون رقم جوال",
          );

        if (emp.app_user_id) {
          const existing = await tx.api_users.findUnique({
            where: { user_id: emp.app_user_id },
          });
          if (existing) {
            return {
              appUserId: existing.user_id,
              phone: existing.user_phone ?? emp.phone,
              alreadyExists: true,
            };
          }
        }

        const phoneTaken = await tx.api_users.findFirst({
          where: { user_phone: emp.phone },
        });
        if (phoneTaken) {
          const owner = await tx.employees.findFirst({
            where: { app_user_id: phoneTaken.user_id },
          });
          if (owner?.id === id) {
            await tx.employees.update({
              where: { id },
              data: { app_user_id: phoneTaken.user_id },
            });
            return {
              appUserId: phoneTaken.user_id,
              phone: phoneTaken.user_phone ?? emp.phone,
              alreadyExists: true,
            };
          }
          throw new ConflictException("رقم الجوال مُستخدم لحساب تطبيق آخر");
        }

        const loginTaken = await tx.users.findFirst({
          where: { username: emp.phone },
        });
        if (loginTaken && loginTaken.emp_code !== id) {
          throw new ConflictException("رقم الجوال مُستخدم لحساب دخول موظف آخر");
        }

        // MobileService authenticates through the canonical staff `users`
        // table. Provision the exact same generated credential there before
        // creating the legacy api_users compatibility row; otherwise the
        // password returned to HR could never be used by the mobile login API.
        await this.provisionUser(
          id,
          emp.employee ?? emp.phone,
          emp.phone,
          emp.branch_id_fk,
          undefined,
          undefined,
          { username: emp.phone, password: plainPassword },
          tx,
        );

        const appUser = await tx.api_users.create({
          data: {
            user_name: emp.employee ?? emp.phone,
            user_phone: emp.phone,
            user_email: emp.email ?? null,
            user_city: null,
            user_pass,
            status: 1,
          },
        });
        createdAppUserId = appUser.user_id;
        await tx.employees.update({
          where: { id },
          data: { app_user_id: appUser.user_id },
        });
        return {
          appUserId: appUser.user_id,
          phone: appUser.user_phone ?? emp.phone,
          alreadyExists: false,
        };
      });
    } catch (error) {
      // api_users is legacy/non-transactional in some deployments. Remove a row
      // created by this attempt if the employee link could not be committed.
      if (createdAppUserId != null) {
        await this.prisma.api_users
          .delete({ where: { user_id: createdAppUserId } })
          .catch(() => undefined);
      }
      throw error;
    }

    return {
      ...result,
      ...(result.alreadyExists ? {} : { password: plainPassword }),
    };
  }

  async setStatus(id: number, employeeType: number) {
    await this.prisma.employees.update({
      where: { id },
      data: { employee_type: employeeType },
    });
    return { id, employee_type: employeeType };
  }

  /** Soft delete (recoverable) — same exit effect as archive / clearance. */
  async remove(id: number, actorUserId?: number) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!emp) throw new NotFoundException("الموظف غير موجود");
    await markEmployeeExited(this.prisma, {
      employeeId: id,
      lastWorkingDate: cairoDateString(),
      reason: "إنهاء خدمة",
      actorUserId,
    });
    return { id, leave_emp: 1 };
  }

  async restore(id: number) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { id: true, leave_emp: true },
    });
    if (!emp) throw new NotFoundException("الموظف غير موجود");
    await restoreEmployee(this.prisma, id);
    return { id, leave_emp: 0 };
  }

  // ---- Finance (allowances / deductions + basic salary) ----
  async getFinance(id: number) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true, basic_salary: true },
    });
    if (!emp) throw new NotFoundException("الموظف غير موجود");
    const rows = await this.prisma.hr_finance_employes.findMany({
      where: { emp_id: id },
    });
    return {
      basic_salary: emp.basic_salary?.toString() ?? "",
      rows: rows.map((r) => ({
        id: String(r.id),
        badl_type: String(r.badl_type) as "1" | "2",
        badl_discount_id_fk: String(r.badl_discount_id_fk),
        value: String(r.value),
        method_to_count: METHOD_FROM_NUM[r.method_to_count] ?? "fixed",
        date_from: r.date_from ?? "",
        date_to: r.date_to ?? "",
        insurance_affect: r.insurance_affect === 1,
      })),
    };
  }

  async putFinance(
    id: number,
    body: { rows?: any[]; basic_salary?: string },
    userId?: number,
  ) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true },
    });
    if (!emp) throw new NotFoundException("الموظف غير موجود");
    const empCode = emp.emp_code ?? 0;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const existingFinanceIds = await this.prisma.hr_finance_employes.findMany({
      where: { emp_id: id },
      select: { id: true },
    });
    const submittedIds = new Set(
      rows
        .map((row) => Number(row.id))
        .filter((rowId) => Number.isFinite(rowId)),
    );
    const removesPersistedRows = existingFinanceIds.some(
      (row) => !submittedIds.has(row.id),
    );
    if (
      removesPersistedRows &&
      (!userId ||
        !(await this.permissionEngine.can(userId, "employees.list", "delete")))
    ) {
      throw new ForbiddenException("حذف بند مالي يتطلب صلاحية حذف الموظفين");
    }
    const basicSalary = Number(String(body.basic_salary ?? "").trim());
    if (!Number.isFinite(basicSalary) || basicSalary <= 0) {
      throw new BadRequestException(
        "الراتب الأساسي يجب أن يكون رقمًا أكبر من صفر",
      );
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
      const aff =
        r.insurance_affect === true ||
        r.insurance_affect === 1 ||
        r.insurance_affect === "1";
      if (t === 1) {
        havingAll += v;
        if (aff) havingTamin += v;
      } else if (t === 2) {
        discutAll += v;
      }
    }

    const catalogIds = [
      ...new Set(
        rows
          .map((r) => Number(r.badl_discount_id_fk))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
    const catalogs = catalogIds.length
      ? await this.prisma.all_defined_setting.findMany({
          where: { defined_id: { in: catalogIds } },
          select: { defined_id: true, defined_title: true, defined_type: true },
        })
      : [];
    const catalogById = new Map(catalogs.map((c) => [c.defined_id, c]));

    await this.prisma.$transaction([
      this.prisma.employees.update({
        where: { id },
        data: { basic_salary: basicSalary },
      }),
      this.prisma.hr_finance_employes.deleteMany({ where: { emp_id: id } }),
      this.prisma.hr_finance_employes.createMany({
        data: rows.map((r) => {
          const badlId = Number(r.badl_discount_id_fk) || 0;
          const catalog = catalogById.get(badlId);
          const engineCode = resolveEngineBadlCode({
            badlCode: Number(r.badl_code) || null,
            catalogId: badlId,
            title: catalog?.defined_title,
          });
          return {
            emp_id: id,
            emp_code: empCode,
            badl_discount_id_fk: badlId,
            // Same identity the engine and loan ceiling consume (100–106 when known).
            badl_code: engineCode,
            badl_type: Number(r.badl_type) || catalog?.defined_type || 1,
            value: Number(r.value) || 0,
            method_to_count: METHOD_TO_NUM[r.method_to_count as string] ?? 1,
            specific_period: r.date_from ? "1" : "0",
            date_from: r.date_from || null,
            date_to: r.date_to || null,
            insurance_affect:
              r.insurance_affect === true ||
              r.insurance_affect === 1 ||
              r.insurance_affect === "1"
                ? 1
                : 0,
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
    if (!row) throw new NotFoundException("البند غير موجود");
    const empCode = row.emp_code;
    const value = row.value ?? 0;
    const type = row.badl_type;
    const affectedTamin = row.insurance_affect === 1;

    await this.prisma.hr_finance_employes.delete({ where: { id: rowId } });

    // Read a surviving row to get the current running totals (legacy get_new_value).
    const surviving = await this.prisma.hr_finance_employes.findFirst({
      where: { emp_code: empCode },
    });
    if (!surviving) return { id: empId, deleted: rowId };

    const data: Prisma.hr_finance_employesUpdateManyMutationInput = {};
    if (type === 1) {
      data.having_all_value =
        Number(surviving.having_all_value ?? 0) - Number(value);
      if (affectedTamin) {
        data.having_tamin_value =
          Number(surviving.having_tamin_value ?? 0) - Number(value);
      }
    } else if (type === 2) {
      data.discut_all_value =
        Number(surviving.discut_all_value ?? 0) - Number(value);
    }
    if (Object.keys(data).length) {
      await this.prisma.hr_finance_employes.updateMany({
        where: { emp_code: empCode },
        data,
      });
    }
    return { id: empId, deleted: rowId };
  }

  // ---- Dwam (work schedule) ----
  async getDwam(id: number) {
    const row = await this.prisma.hr_emp_dwam.findFirst({
      where: { emp_id: id },
    });
    const schedule = Object.entries(DAY_COL).map(([day, col]) => ({
      day: Number(day),
      enabled: row ? (row[col] as number) === 1 : false,
      startTime: row?.attend_time ?? "08:00",
      endTime: row?.leave_time ?? "17:00",
    }));
    return { shift_type: shiftTypeToLabel(row?.always_id_fk), schedule };
  }

  async putDwam(id: number, body: { schedule?: any[]; shift_type?: string }) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true },
    });
    if (!emp) throw new NotFoundException("الموظف غير موجود");
    const schedule = Array.isArray(body.schedule) ? body.schedule : [];
    const flags: Record<string, number> = {
      saturday: 0,
      sunday: 0,
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
    };
    let attend = "08:00";
    let leave = "17:00";
    for (const d of schedule) {
      const col = DAY_COL[Number(d.day)];
      if (col) flags[col] = d.enabled ? 1 : 0;
      if (d.enabled && d.startTime) {
        attend = d.startTime;
        leave = d.endTime ?? leave;
      }
    }
    const shiftCode =
      body.shift_type != null ? parseShiftType(body.shift_type) : 0;
    const base = {
      emp_code: String(emp.emp_code ?? ""),
      always_id_fk: shiftCode,
      period_id_fk: 0,
      attend_time: attend,
      leave_time: leave,
      ...flags,
    };
    const existing = await this.prisma.hr_emp_dwam.findFirst({
      where: { emp_id: id },
    });
    if (existing) {
      await this.prisma.hr_emp_dwam.update({
        where: { id: existing.id },
        data: base,
      });
    } else {
      await this.prisma.hr_emp_dwam.create({
        data: {
          emp_id: id,
          ...base,
          // legacy NOT-NULL columns without defaults
          start_enter: "",
          end_enter: "",
          start_out: "",
          end_out: "",
          from_date: 0,
          from_date_ar: "",
          to_date: 0,
          to_date_ar: "",
        },
      });
    }
    return { id };
  }

  // ---- Read-only sub-resources for the profile tabs ----
  async getBanks(id: number) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true },
    });
    if (!emp?.emp_code) return [];
    return this.prisma.bank_employes_details.findMany({
      where: { emp_code: emp.emp_code },
    });
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
    userId?: number,
  ) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true },
    });
    if (!emp) throw new NotFoundException("الموظف غير موجود");
    const empCode = emp.emp_code ?? 0;
    const rows = Array.isArray(body.rows) ? body.rows : [];

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await claimEmployeePrivateFile(tx, row.bank_id_fk_image, id, userId, [
          "emp-bank",
        ]);
      }
      await tx.bank_employes_details.deleteMany({
        where: { emp_code: empCode },
      });
      if (rows.length) {
        await tx.bank_employes_details.createMany({
          data: rows.map((r) => ({
            emp_code: empCode,
            bank_id_fk: Number(r.bank_id_fk) || 0,
            bank_account_num: String(r.bank_account_num ?? "0"),
            bank_code: r.bank_code ?? null,
            approved_for_sarf:
              r.approved_for_sarf === true || r.approved_for_sarf === 1 ? 1 : 0,
            emp_bank_name: r.emp_bank_name ?? null,
            bank_id_fk_image: r.bank_id_fk_image ?? null,
          })),
        });
      }
    });

    return { id, count: rows.length };
  }

  async getContract(id: number) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true },
    });
    if (!emp?.emp_code) return null;
    return this.prisma.contract_employe.findUnique({
      where: { emp_code: String(emp.emp_code) },
    });
  }

  private static CONTRACT_STR = [
    "num_days_in_month",
    "hours_work",
    "hour_value",
    "work_period_id_fk",
    "job_type",
    "pay_method_id_fk",
    "bank_id_fk",
    "bank_code",
    "bank_account_num",
    "year_vacation_num",
    "year_vacation_period",
    "casual_vacation_num",
    "travel_ticket",
    "travel_type_fk",
    "travel_period",
    "vacation_start_ar",
    "vacation_start_m",
    "vacation_start_h",
    "travel_type_name",
  ];
  private static CONTRACT_NUM = [
    "contract_nature",
    "reward_end_work",
    "vacation_previous_balance",
  ];

  /** Create or update the employment contract (contract_employe) — the previously read-only tab. */
  async putContract(id: number, body: Record<string, unknown>) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true },
    });
    if (!emp?.emp_code) throw new NotFoundException("الموظف غير موجود");
    const empCode = String(emp.emp_code);

    const data: Record<string, unknown> = {};
    for (const k of EmployeesService.CONTRACT_STR)
      if (body[k] != null) data[k] = String(body[k]);
    for (const k of EmployeesService.CONTRACT_NUM)
      if (body[k] != null) data[k] = Number(body[k]);

    return this.prisma.contract_employe.upsert({
      where: { emp_code: empCode },
      update: data as never,
      create: {
        emp_code: empCode,
        vacation_previous_balance: 0,
        vacation_start_ar: "",
        ...data,
      } as never,
    });
  }

  async getDocuments(id: number) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true },
    });
    return this.prisma.emp_files.findMany({
      where: {
        OR: [
          { emp_id: id },
          ...(emp?.emp_code ? [{ emp_code: String(emp.emp_code) }] : []),
        ],
      },
      orderBy: { id: "desc" },
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
    userId?: number,
  ) {
    const emp = await this.prisma.employees.findUnique({
      where: { id },
      select: { emp_code: true },
    });
    if (!emp) throw new NotFoundException("الموظف غير موجود");
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const empCode = String(emp.emp_code ?? "0");

    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        await claimEmployeePrivateFile(tx, r.file_path, id, userId, [
          "document",
        ]);
        const data = {
          emp_id: id,
          emp_code: empCode,
          title: r.file_type ?? r.file_name ?? "",
          emp_file: r.file_path ?? "",
          to_date: r.expire_date ?? null,
          have_date: r.expire_date ? 1 : 0,
        };
        const rowId = r.id != null ? Number(r.id) : NaN;
        if (!Number.isNaN(rowId) && rowId > 0) {
          const existing = await this.prisma.emp_files.findFirst({
            where: { id: rowId, emp_id: id },
          });
          if (existing) {
            await tx.emp_files.update({ where: { id: rowId }, data });
          } else {
            await tx.emp_files.create({ data });
          }
        } else {
          await tx.emp_files.create({ data });
        }
      }
    });
    return { id, count: rows.length };
  }

  async getInsurance(id: number) {
    const e = await this.prisma.employees.findUnique({ where: { id } });
    if (!e) throw new NotFoundException("الموظف غير موجود");
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
