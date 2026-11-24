import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import {
  HR_PAYROLL_SETTING_DEFS,
  HrPayrollSettings,
  PayrollConfigDefaults,
  coerceSettingValue,
  defaultHrPayrollSettings,
  mergeHrPayrollSettings,
} from './hr-payroll-settings.defaults';

const CACHE_TTL_MS = 60_000;

interface StoredRow {
  setting_key: string;
  setting_value: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: Date | string | null;
}

/** Shared by every instance in the process, so a save is seen by payroll and attendance at once. */
let cache: { at: number; rows: StoredRow[] } | null = null;

/** Test hook / save path: forget the cached rows. */
export function invalidateHrPayrollSettingsCache(): void {
  cache = null;
}

/**
 * Owner-editable HR / payroll rules (table hr_payroll_settings, raw SQL — production never runs
 * `prisma generate`). One row per changed rule; a missing row means "default". If the table is
 * missing or unreadable the defaults are used, so payroll and punches never fail because of it.
 */
@Injectable()
export class HrPayrollSettingsService {
  private readonly logger = new Logger(HrPayrollSettingsService.name);
  private readonly configDefaults: PayrollConfigDefaults;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() config?: ConfigService,
  ) {
    this.configDefaults = {
      workingDays: config?.get<number>('payroll.workingDays'),
      hoursPerDay: config?.get<number>('payroll.hoursPerDay'),
      defaultOffDay: config?.get<string>('payroll.defaultOffDay'),
      deductionExemptEmpCodes: config?.get<number[]>('payroll.deductionExemptEmpCodes'),
    };
  }

  defaults(): HrPayrollSettings {
    return defaultHrPayrollSettings(this.configDefaults);
  }

  /** Effective settings (cached ~60 s, invalidated on save). */
  async get(): Promise<HrPayrollSettings> {
    return mergeHrPayrollSettings(this.defaults(), parseStored(await this.rows()));
  }

  /** Page payload: effective values, defaults, which keys are overridden and by whom. */
  async view() {
    const rows = await this.rows();
    const defaults = this.defaults();
    const values = mergeHrPayrollSettings(defaults, parseStored(rows));
    const known = new Set<string>(HR_PAYROLL_SETTING_DEFS.map((d) => d.key));
    const overrides: Record<string, { updatedBy: string | null; updatedAt: string | null }> = {};
    let lastUpdated: { by: string | null; at: string | null } | null = null;
    for (const row of rows) {
      if (!known.has(row.setting_key)) continue;
      const at = toIso(row.updated_at);
      overrides[row.setting_key] = { updatedBy: row.updated_by_name, updatedAt: at };
      if (at && (!lastUpdated?.at || at > lastUpdated.at)) lastUpdated = { by: row.updated_by_name, at };
    }
    return {
      values,
      defaults,
      overrides,
      lastUpdated,
      exemptEmployees: await this.employeeNames(values.deductionExemptEmpCodes),
    };
  }

  /**
   * Save the submitted keys. `null` resets a key to its default (row deleted). Every value is
   * validated first; nothing is written when one is invalid.
   */
  async save(values: Record<string, unknown> | undefined, user?: JwtUser) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new BadRequestException('لا توجد إعدادات للحفظ');
    }
    const writes: Array<{ key: string; value: string | null }> = [];
    for (const [key, raw] of Object.entries(values)) {
      const def = HR_PAYROLL_SETTING_DEFS.find((d) => d.key === key);
      if (!def) throw new BadRequestException(`إعداد غير معروف: ${key}`);
      if (raw === null) {
        writes.push({ key, value: null });
        continue;
      }
      const value = coerceSettingValue(def, raw);
      if (value === undefined) throw new BadRequestException(`قيمة غير صحيحة للإعداد: ${key}`);
      writes.push({ key, value: JSON.stringify(value) });
    }
    if (!writes.length) return this.view();

    const userId = user?.sub ?? null;
    const userName = (user?.name ?? '').slice(0, 150) || null;
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const write of writes) {
          if (write.value === null) {
            await tx.$executeRaw(Prisma.sql`DELETE FROM hr_payroll_settings WHERE setting_key = ${write.key}`);
          } else {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO hr_payroll_settings (setting_key, setting_value, updated_by, updated_by_name, updated_at)
              VALUES (${write.key}, ${write.value}, ${userId}, ${userName}, CURRENT_TIMESTAMP)
              ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by),
                updated_by_name = VALUES(updated_by_name), updated_at = CURRENT_TIMESTAMP`);
          }
        }
      });
    } catch (error) {
      this.logger.error(`hr_payroll_settings save failed: ${errorMessage(error)}`);
      throw new BadRequestException('تعذّر حفظ الإعدادات — تأكد من تشغيل ترحيل قاعدة البيانات hr_payroll_settings');
    } finally {
      invalidateHrPayrollSettingsCache();
    }
    return this.view();
  }

  private async rows(): Promise<StoredRow[]> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
    let rows: StoredRow[] = [];
    try {
      if (typeof (this.prisma as { $queryRaw?: unknown }).$queryRaw === 'function') {
        rows = await this.prisma.$queryRaw<StoredRow[]>(Prisma.sql`
          SELECT setting_key, setting_value, updated_by, updated_by_name, updated_at FROM hr_payroll_settings`);
      }
    } catch (error) {
      // Table missing (migration not applied yet) → defaults; retried after the TTL.
      this.logger.warn(`hr_payroll_settings unavailable, using defaults: ${errorMessage(error)}`);
      rows = [];
    }
    cache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
    return cache.rows;
  }

  private async employeeNames(codes: number[]): Promise<Array<{ empCode: number; name: string | null }>> {
    if (!codes.length) return [];
    try {
      const found = await this.prisma.employees.findMany({
        where: { emp_code: { in: codes } },
        select: { emp_code: true, employee: true },
      });
      return codes.map((code) => ({ empCode: code, name: found.find((e) => e.emp_code === code)?.employee ?? null }));
    } catch {
      return codes.map((code) => ({ empCode: code, name: null }));
    }
  }
}

function parseStored(rows: StoredRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    if (!row || typeof row.setting_key !== 'string' || row.setting_value == null) continue;
    try {
      out[row.setting_key] = JSON.parse(row.setting_value);
    } catch {
      out[row.setting_key] = row.setting_value;
    }
  }
  return out;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
