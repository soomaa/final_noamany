import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AccountType, Prisma } from "@prisma/client";
import { paginated } from "../../common/dto/list-result";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildAccountTree, normalBalanceForType } from "./accounting.utils";
import { DEFAULT_CHART, seedAccountPayload } from "./accounts.seed";
import { FULL_GYM_CHART } from "./accounts.full-seed";
import {
  CreateAccountDto,
  ListAccountsDto,
  NextCodeQueryDto,
  UpdateAccountDto,
  UpdateAccountingSettingsDto,
} from "./dto/accounting.dto";

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertIsoDate(value: string, label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${label} غير صالح`);
    }
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day!));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month! - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${label} غير صالح`);
    }
  }

  private assertFiscalYearStart(value: string) {
    const [month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(2000, month! - 1, day!));
    if (
      !month ||
      !day ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException("بداية السنة المالية غير صالحة");
    }
  }

  private mapAccount(row: {
    id: number;
    code: string;
    name: string;
    account_type: import("@prisma/client").AccountType;
    normal_balance: import("@prisma/client").NormalBalance;
    parent_id: number | null;
    is_postable: boolean;
    category: string | null;
    description: string | null;
    branch_id: number | null;
    is_active: boolean;
  }) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      accountType: row.account_type,
      normalBalance: row.normal_balance,
      parentId: row.parent_id,
      isPostable: row.is_postable,
      category: row.category,
      description: row.description,
      branchId: row.branch_id,
      isActive: row.is_active,
    };
  }

  async tree() {
    const rows = await this.prisma.acc_accounts.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
    });
    return buildAccountTree(rows, (r) => this.mapAccount(r));
  }

  async list(q: ListAccountsDto) {
    const where: Prisma.acc_accountsWhereInput = { is_active: true };
    if (q.branchId != null) where.branch_id = q.branchId;
    if (q.type) where.account_type = q.type;
    if (q.postableOnly) where.is_postable = true;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ code: { contains: s } }, { name: { contains: s } }];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.acc_accounts.count({ where }),
      this.prisma.acc_accounts.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { code: "asc" },
      }),
    ]);
    return paginated(
      rows.map((r) => this.mapAccount(r)),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findOne(id: number) {
    const row = await this.prisma.acc_accounts.findUnique({
      where: { id },
      include: {
        parent: true,
        children: { where: { is_active: true }, orderBy: { code: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("الحساب غير موجود");
    return {
      ...this.mapAccount(row),
      parent: row.parent ? this.mapAccount(row.parent) : null,
      children: row.children.map((c) => this.mapAccount(c)),
    };
  }

  async nextCode(q: NextCodeQueryDto) {
    let parentCode = "";
    let parentId: number | null = null;
    if (q.parentId) {
      const parent = await this.prisma.acc_accounts.findUnique({
        where: { id: q.parentId },
      });
      if (!parent) throw new NotFoundException("الحساب الأب غير موجود");
      parentCode = parent.code;
      parentId = parent.id;
    }
    const prefix = parentCode ? `${parentCode}.` : "";
    const siblings = await this.prisma.acc_accounts.findMany({
      where: { parent_id: parentId, is_active: true },
      select: { code: true },
    });
    let max = 0;
    for (const s of siblings) {
      const tail = s.code.startsWith(prefix)
        ? s.code.slice(prefix.length)
        : s.code;
      const part = parseInt(tail.split(".")[0] ?? "0", 10);
      if (!Number.isNaN(part)) max = Math.max(max, part);
    }
    const next = String(max + 1).padStart(parentCode ? 3 : 1, "0");
    return { code: `${prefix}${next}` };
  }

  async create(dto: CreateAccountDto) {
    let parent: { id: number; account_type: string; code: string } | null =
      null;
    if (dto.parentId) {
      parent = await this.prisma.acc_accounts.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException("الحساب الأب غير موجود");
      const directLines = await this.prisma.acc_journal_entry_lines.count({
        where: { account_id: parent.id, entry: { status: "posted" } },
      });
      if (directLines > 0) {
        throw new BadRequestException(
          "لا يمكن جعل الحساب الأب غير قابل للترحيل — توجد حركات مباشرة عليه",
        );
      }
      await this.prisma.acc_accounts.update({
        where: { id: parent.id },
        data: { is_postable: false },
      });
    }
    const accountType = (parent?.account_type ?? "asset") as
      "asset" | "liability" | "equity" | "revenue" | "expense";
    let code = dto.code?.trim();
    if (!code) {
      const suggested = await this.nextCode({ parentId: dto.parentId });
      code = suggested.code;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.prisma.acc_accounts.create({
          data: {
            code: attempt === 0 ? code : `${code}-${attempt}`,
            name: dto.name,
            account_type: accountType,
            normal_balance: normalBalanceForType(accountType),
            parent_id: dto.parentId ?? null,
            is_postable: true,
            category: dto.category ?? null,
            description: dto.description ?? null,
            branch_id: dto.branchId ?? null,
          },
        });
        return this.mapAccount(row);
      } catch (e) {
        if (!(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ))
          throw e;
      }
    }
    throw new BadRequestException("تعذر إنشاء الحساب — رمز مكرر");
  }

  async update(id: number, dto: UpdateAccountDto) {
    await this.findOne(id);
    const row = await this.prisma.acc_accounts.update({
      where: { id },
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        branch_id: dto.branchId,
      },
    });
    return this.mapAccount(row);
  }

  async remove(id: number) {
    const acc = await this.prisma.acc_accounts.findUnique({
      where: { id },
      include: { children: { where: { is_active: true } } },
    });
    if (!acc) throw new NotFoundException("الحساب غير موجود");
    if (acc.children.length > 0) {
      throw new BadRequestException("لا يمكن حذف حساب له حسابات فرعية");
    }
    const lineCount = await this.prisma.acc_journal_entry_lines.count({
      where: {
        account_id: id,
        entry: { status: "posted" },
      },
    });
    if (lineCount > 0) {
      throw new BadRequestException("لا يمكن حذف حساب له قيود مرحّلة");
    }
    await this.prisma.acc_accounts.update({
      where: { id },
      data: { is_active: false },
    });
    return { ok: true };
  }

  /** Idempotent: seeds default chart when no accounts exist yet; syncs default-account keys. */
  async ensureSeeded(): Promise<void> {
    const count = await this.prisma.acc_accounts.count();
    if (count === 0) {
      await this.seedDefaults();
      return;
    }
    // Backfill any DEFAULT_CHART accounts added after the initial seed (e.g. '4.06 إيرادات أخرى'),
    // so already-seeded databases still resolve newly-introduced default keys to a real account
    // instead of a dangling account_code.
    const codeToId = new Map<string, number>();
    for (const def of DEFAULT_CHART) {
      let acc = await this.prisma.acc_accounts.findUnique({
        where: { code: def.code },
      });
      if (!acc) {
        const parentId = def.parentCode
          ? (codeToId.get(def.parentCode) ?? null)
          : null;
        acc = await this.prisma.acc_accounts.create({
          data: seedAccountPayload(def, parentId),
        });
      }
      codeToId.set(def.code, acc.id);
    }
    for (const def of DEFAULT_CHART) {
      if (!def.defaultKey) continue;
      const existing = await this.prisma.acc_default_accounts.findFirst({
        where: { key: def.defaultKey, branch_id: null },
      });
      if (!existing) {
        await this.prisma.acc_default_accounts.create({
          data: {
            key: def.defaultKey,
            account_code: def.code,
            branch_id: null,
          },
        });
      }
    }
  }

  async seedDefaults() {
    const codeToId = new Map<string, number>();
    for (const def of DEFAULT_CHART) {
      const existing = await this.prisma.acc_accounts.findUnique({
        where: { code: def.code },
      });
      if (existing) {
        codeToId.set(def.code, existing.id);
        continue;
      }
      const parentId = def.parentCode
        ? (codeToId.get(def.parentCode) ?? null)
        : null;
      const row = await this.prisma.acc_accounts.create({
        data: seedAccountPayload(def, parentId),
      });
      codeToId.set(def.code, row.id);
    }
    for (const def of DEFAULT_CHART) {
      if (!def.defaultKey) continue;
      const existing = await this.prisma.acc_default_accounts.findFirst({
        where: { key: def.defaultKey, branch_id: null },
      });
      if (!existing) {
        await this.prisma.acc_default_accounts.create({
          data: {
            key: def.defaultKey,
            account_code: def.code,
            branch_id: null,
          },
        });
      }
    }
    const settings = await this.prisma.acc_settings.findFirst();
    if (!settings) {
      await this.prisma.acc_settings.create({ data: {} });
    }
    const year = new Date().getFullYear();
    const periodName = String(year);
    const existingPeriod = await this.prisma.acc_accounting_periods.findFirst({
      where: { name: periodName },
    });
    if (!existingPeriod) {
      await this.prisma.acc_accounting_periods.create({
        data: {
          name: periodName,
          start_date: `${year}-01-01`,
          end_date: `${year}-12-31`,
          status: "open",
        },
      });
    }
    return { ok: true, accounts: DEFAULT_CHART.length };
  }

  /** Idempotent: seeds full gym COA (~90 accounts). Skips existing codes. */
  async seedFullGymTree() {
    const codeToId = new Map<string, number>();
    let created = 0;
    for (const def of FULL_GYM_CHART) {
      const existing = await this.prisma.acc_accounts.findUnique({
        where: { code: def.code },
      });
      if (existing) {
        codeToId.set(def.code, existing.id);
        continue;
      }
      const parentId = def.parentCode
        ? (codeToId.get(def.parentCode) ?? null)
        : null;
      const row = await this.prisma.acc_accounts.create({
        data: seedAccountPayload(def, parentId),
      });
      codeToId.set(def.code, row.id);
      created++;
    }
    for (const def of FULL_GYM_CHART) {
      if (!def.defaultKey) continue;
      const existing = await this.prisma.acc_default_accounts.findFirst({
        where: { key: def.defaultKey, branch_id: null },
      });
      if (!existing) {
        await this.prisma.acc_default_accounts.create({
          data: {
            key: def.defaultKey,
            account_code: def.code,
            branch_id: null,
          },
        });
      }
    }
    await this.ensureSettingsAndPeriod();
    return { ok: true, created, total: FULL_GYM_CHART.length };
  }

  private async ensureSettingsAndPeriod() {
    const settings = await this.prisma.acc_settings.findFirst();
    if (!settings) await this.prisma.acc_settings.create({ data: {} });
    const year = new Date().getFullYear();
    const existingPeriod = await this.prisma.acc_accounting_periods.findFirst({
      where: { name: String(year) },
    });
    if (!existingPeriod) {
      await this.prisma.acc_accounting_periods.create({
        data: {
          name: String(year),
          start_date: `${year}-01-01`,
          end_date: `${year}-12-31`,
          status: "open",
        },
      });
    }
  }

  async getSettings() {
    let settings = await this.prisma.acc_settings.findFirst();
    if (!settings) {
      settings = await this.prisma.acc_settings.create({ data: {} });
    }
    const defaults = await this.prisma.acc_default_accounts.findMany({
      where: { branch_id: null },
    });
    const defaultAccounts: Record<string, string> = {};
    for (const d of defaults) defaultAccounts[d.key] = d.account_code;
    return {
      fiscalYearStart: settings.fiscal_year_start,
      baseCurrency: settings.base_currency,
      currencySymbol: settings.currency_symbol,
      requireApproval: settings.require_approval,
      defaultAccounts,
    };
  }

  async updateSettings(dto: UpdateAccountingSettingsDto) {
    if (dto.fiscalYearStart) this.assertFiscalYearStart(dto.fiscalYearStart);

    const defaultEntries = Object.entries(dto.defaultAccounts ?? {}).map(
      ([key, code]) => [key, String(code).trim()] as const,
    );
    if (defaultEntries.some(([, code]) => !code)) {
      throw new BadRequestException("لا يمكن ربط حساب افتراضي برمز فارغ");
    }

    if (defaultEntries.length) {
      const codes = [...new Set(defaultEntries.map(([, code]) => code))];
      const accounts = await this.prisma.acc_accounts.findMany({
        where: { code: { in: codes }, is_active: true, is_postable: true },
        select: { code: true, account_type: true },
      });
      const byCode = new Map(
        accounts.map((account) => [account.code, account]),
      );
      const invalidCodes = codes.filter((code) => !byCode.has(code));
      if (invalidCodes.length) {
        throw new BadRequestException(
          `الحسابات الافتراضية يجب أن تكون موجودة ونشطة وقابلة للترحيل: ${invalidCodes.join(", ")}`,
        );
      }

      const expectedTypes = new Map<string, AccountType>();
      for (const def of [...DEFAULT_CHART, ...FULL_GYM_CHART]) {
        if (def.defaultKey) expectedTypes.set(def.defaultKey, def.accountType);
      }
      const wrongType = defaultEntries.find(([key, code]) => {
        const expected = expectedTypes.get(key);
        return expected && byCode.get(code)?.account_type !== expected;
      });
      if (wrongType) {
        throw new BadRequestException(
          `نوع الحساب الافتراضي ${wrongType[0]} غير متوافق`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      let settings = await tx.acc_settings.findFirst();
      if (!settings) settings = await tx.acc_settings.create({ data: {} });
      await tx.acc_settings.update({
        where: { id: settings.id },
        data: {
          fiscal_year_start: dto.fiscalYearStart,
          base_currency: dto.baseCurrency?.trim().toUpperCase(),
          currency_symbol: dto.currencySymbol?.trim(),
          require_approval: dto.requireApproval,
        },
      });
      for (const [key, accountCode] of defaultEntries) {
        const existing = await tx.acc_default_accounts.findFirst({
          where: { key, branch_id: null },
        });
        if (existing) {
          await tx.acc_default_accounts.update({
            where: { id: existing.id },
            data: { account_code: accountCode },
          });
        } else {
          await tx.acc_default_accounts.create({
            data: { key, account_code: accountCode, branch_id: null },
          });
        }
      }
    });
    return this.getSettings();
  }

  async listPeriods() {
    const rows = await this.prisma.acc_accounting_periods.findMany({
      orderBy: { start_date: "desc" },
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      startDate: p.start_date,
      endDate: p.end_date,
      status: p.status,
      closedBy: p.closed_by,
      closedAt: p.closed_at,
    }));
  }

  async closePeriod(id: number, userId: number) {
    const period = await this.prisma.acc_accounting_periods.findUnique({
      where: { id },
    });
    if (!period) throw new NotFoundException("الفترة غير موجودة");
    if (period.status !== "open") {
      throw new BadRequestException("الفترة مغلقة بالفعل");
    }
    const draftCount = await this.prisma.acc_journal_entries.count({
      where: {
        status: "draft",
        date: { gte: period.start_date, lte: period.end_date },
      },
    });
    if (draftCount > 0) {
      throw new BadRequestException(
        `لا يمكن إقفال الفترة قبل ترحيل أو حذف ${draftCount} قيد مسودة`,
      );
    }
    return this.prisma.acc_accounting_periods.update({
      where: { id },
      data: { status: "closed", closed_by: userId, closed_at: new Date() },
    });
  }

  async reopenPeriod(id: number) {
    const period = await this.prisma.acc_accounting_periods.findUnique({
      where: { id },
    });
    if (!period) throw new NotFoundException("الفترة غير موجودة");
    if (period.status === "open") {
      throw new BadRequestException("الفترة مفتوحة بالفعل");
    }
    const overlappingOpen = await this.prisma.acc_accounting_periods.findFirst({
      where: {
        id: { not: id },
        status: "open",
        start_date: { lte: period.end_date },
        end_date: { gte: period.start_date },
      },
    });
    if (overlappingOpen) {
      throw new BadRequestException(
        "لا يمكن إعادة فتح فترة تتداخل مع فترة مفتوحة",
      );
    }
    return this.prisma.acc_accounting_periods.update({
      where: { id },
      data: { status: "open", closed_by: null, closed_at: null },
    });
  }

  async createPeriod(dto: {
    year?: number;
    name?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const year = dto.year ?? new Date().getFullYear();
    const name = dto.name?.trim() || String(year);
    const startDate = dto.startDate ?? `${year}-01-01`;
    const endDate = dto.endDate ?? `${year}-12-31`;
    this.assertIsoDate(startDate, "تاريخ بداية الفترة");
    this.assertIsoDate(endDate, "تاريخ نهاية الفترة");
    if (startDate > endDate) {
      throw new BadRequestException(
        "تاريخ بداية الفترة يجب أن يسبق تاريخ نهايتها",
      );
    }
    const existing = await this.prisma.acc_accounting_periods.findFirst({
      where: { name },
    });
    if (existing)
      throw new BadRequestException("فترة بنفس الاسم موجودة بالفعل");
    const overlap = await this.prisma.acc_accounting_periods.findFirst({
      where: {
        start_date: { lte: endDate },
        end_date: { gte: startDate },
      },
    });
    if (overlap)
      throw new BadRequestException("الفترة تتداخل مع فترة محاسبية موجودة");
    const row = await this.prisma.acc_accounting_periods.create({
      data: { name, start_date: startDate, end_date: endDate, status: "open" },
    });
    return {
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    };
  }
}
