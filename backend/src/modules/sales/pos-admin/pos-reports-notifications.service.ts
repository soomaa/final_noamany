import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../../common/dto/list-result';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BranchScopeService } from '../../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../../common/types/jwt-user';
import {
  PosListQueryDto, ScheduleReportDto, TestNotificationDto,
  UpsertPosNotificationRuleDto, UpsertPosReportTemplateDto,
} from './dto/pos-admin.dto';

@Injectable()
export class PosReportTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: number; name: string; report_type: string; frequency: string;
    auto_generate: boolean; recipients: unknown; format: string;
    schedule: unknown; is_active: boolean; sort_order: number;
    last_generated: Date | null; next_generation: Date | null;
  }) {
    return {
      id: row.id, name: row.name, reportType: row.report_type, frequency: row.frequency,
      autoGenerate: row.auto_generate, recipients: row.recipients, format: row.format,
      schedule: row.schedule, isActive: row.is_active, sortOrder: row.sort_order,
      lastGenerated: row.last_generated, nextGeneration: row.next_generation,
    };
  }

  async list(q: PosListQueryDto) {
    const where: Prisma.sales_pos_report_templatesWhereInput = {};
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.search?.trim()) where.name = { contains: q.search.trim() };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sales_pos_report_templates.count({ where }),
      this.prisma.sales_pos_report_templates.findMany({ where, skip: q.skip, take: q.take, orderBy: { sort_order: 'asc' } }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.sales_pos_report_templates.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قالب التقرير غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertPosReportTemplateDto, userId: number) {
    const row = await this.prisma.sales_pos_report_templates.create({
      data: {
        name: dto.name, report_type: (dto.reportType as 'sales') ?? 'sales',
        frequency: (dto.frequency as 'on_demand') ?? 'on_demand',
        auto_generate: dto.autoGenerate ?? false,
        recipients: dto.recipients as Prisma.InputJsonValue,
        format: (dto.format as 'excel') ?? 'excel',
        schedule: dto.schedule as Prisma.InputJsonValue,
        parameters: dto.parameters as Prisma.InputJsonValue,
        filters: dto.filters as Prisma.InputJsonValue,
        columns: dto.columns as Prisma.InputJsonValue,
        sorting: dto.sorting as Prisma.InputJsonValue,
        grouping: dto.grouping as Prisma.InputJsonValue,
        charts: dto.charts as Prisma.InputJsonValue,
        watermark: dto.watermark, retention_days: dto.retentionDays ?? 90,
        is_active: dto.isActive ?? true, sort_order: dto.sortOrder ?? 0, created_by: userId,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertPosReportTemplateDto>, userId: number) {
    await this.findOne(id);
    const row = await this.prisma.sales_pos_report_templates.update({
      where: { id },
      data: {
        name: dto.name, report_type: dto.reportType as never, frequency: dto.frequency as never,
        auto_generate: dto.autoGenerate, recipients: dto.recipients as Prisma.InputJsonValue,
        format: dto.format as never, schedule: dto.schedule as Prisma.InputJsonValue,
        is_active: dto.isActive, sort_order: dto.sortOrder, updated_by: userId,
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.sales_pos_report_templates.delete({ where: { id } });
    return { ok: true };
  }

  async toggle(id: number, userId: number) {
    const row = await this.findOne(id);
    return this.update(id, { isActive: !row.isActive }, userId);
  }

  async schedule(id: number, dto: ScheduleReportDto) {
    const next = this.calcNextGeneration(dto.schedule);
    return this.prisma.sales_pos_report_templates.update({
      where: { id },
      data: {
        schedule: dto.schedule as Prisma.InputJsonValue,
        auto_generate: dto.autoGenerate ?? true,
        next_generation: next,
      },
    });
  }

  async unschedule(id: number) {
    return this.prisma.sales_pos_report_templates.update({
      where: { id },
      data: { auto_generate: false, next_generation: null },
    });
  }

  generateSample(id: number) {
    return { templateId: id, generatedAt: new Date().toISOString(), rows: [], message: 'تم إنشاء عينة التقرير' };
  }

  private calcNextGeneration(schedule?: Record<string, unknown>): Date | null {
    if (!schedule) return null;
    const now = new Date();
    const freq = String(schedule.frequency ?? 'daily');
    const next = new Date(now);
    if (freq === 'daily') next.setDate(next.getDate() + 1);
    else if (freq === 'weekly') next.setDate(next.getDate() + 7);
    else if (freq === 'monthly') next.setMonth(next.getMonth() + 1);
    else if (freq === 'quarterly') next.setMonth(next.getMonth() + 3);
    else if (freq === 'yearly') next.setFullYear(next.getFullYear() + 1);
    else return null;
    return next;
  }

  async stats() {
    const [total, active, scheduled] = await Promise.all([
      this.prisma.sales_pos_report_templates.count(),
      this.prisma.sales_pos_report_templates.count({ where: { is_active: true } }),
      this.prisma.sales_pos_report_templates.count({ where: { auto_generate: true } }),
    ]);
    return { total, active, scheduled };
  }
}

@Injectable()
export class PosNotificationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: number; name: string; notification_type: string; trigger: string;
    threshold: Prisma.Decimal | null; threshold_type: string | null;
    channels: unknown; priority: string; cooldown_minutes: number;
    max_notifications_per_hour: number; is_active: boolean; sort_order: number;
  }) {
    return {
      id: row.id, name: row.name, notificationType: row.notification_type, trigger: row.trigger,
      threshold: row.threshold != null ? Number(row.threshold) : null, thresholdType: row.threshold_type,
      channels: row.channels, priority: row.priority, cooldownMinutes: row.cooldown_minutes,
      maxNotificationsPerHour: row.max_notifications_per_hour, isActive: row.is_active, sortOrder: row.sort_order,
    };
  }

  async list(q: PosListQueryDto) {
    const where: Prisma.sales_pos_notification_rulesWhereInput = {};
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.search?.trim()) where.name = { contains: q.search.trim() };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sales_pos_notification_rules.count({ where }),
      this.prisma.sales_pos_notification_rules.findMany({ where, skip: q.skip, take: q.take, orderBy: { sort_order: 'asc' } }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.sales_pos_notification_rules.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قاعدة الإشعار غير موجودة');
    return this.map(row);
  }

  async create(dto: UpsertPosNotificationRuleDto, userId: number) {
    const row = await this.prisma.sales_pos_notification_rules.create({
      data: {
        name: dto.name, notification_type: (dto.notificationType as 'transaction') ?? 'transaction',
        trigger: dto.trigger, threshold: dto.threshold, threshold_type: dto.thresholdType,
        channels: (dto.channels ?? ['inapp']) as Prisma.InputJsonValue,
        recipients: dto.recipients as Prisma.InputJsonValue,
        message_template: dto.messageTemplate, subject_template: dto.subjectTemplate,
        conditions: dto.conditions as Prisma.InputJsonValue,
        schedule: dto.schedule as Prisma.InputJsonValue,
        priority: (dto.priority as 'normal') ?? 'normal',
        cooldown_minutes: dto.cooldownMinutes ?? 0,
        max_notifications_per_hour: dto.maxNotificationsPerHour ?? 10,
        is_active: dto.isActive ?? true, sort_order: dto.sortOrder ?? 0, created_by: userId,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertPosNotificationRuleDto>, userId: number) {
    await this.findOne(id);
    const row = await this.prisma.sales_pos_notification_rules.update({
      where: { id },
      data: {
        name: dto.name, notification_type: dto.notificationType as never, trigger: dto.trigger,
        threshold: dto.threshold, threshold_type: dto.thresholdType,
        channels: dto.channels as Prisma.InputJsonValue,
        message_template: dto.messageTemplate, priority: dto.priority as never,
        cooldown_minutes: dto.cooldownMinutes, is_active: dto.isActive, sort_order: dto.sortOrder,
        updated_by: userId,
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.sales_pos_notification_rules.delete({ where: { id } });
    return { ok: true };
  }

  async toggle(id: number, userId: number) {
    const row = await this.findOne(id);
    return this.update(id, { isActive: !row.isActive }, userId);
  }

  test(id: number, dto: TestNotificationDto) {
    return { ok: true, ruleId: id, message: dto.message ?? 'إشعار تجريبي', sentAt: new Date().toISOString() };
  }

  sendImmediate(dto: TestNotificationDto) {
    return { ok: true, message: dto.message ?? 'تم الإرسال', sentAt: new Date().toISOString() };
  }

  async stats() {
    const [total, active] = await Promise.all([
      this.prisma.sales_pos_notification_rules.count(),
      this.prisma.sales_pos_notification_rules.count({ where: { is_active: true } }),
    ]);
    return { total, active };
  }
}

@Injectable()
export class PosSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private resolveBranch(user: JwtUser | undefined, requested?: number): number | undefined {
    const allowed = this.branchScope.allowedBranchIds(user);
    if (requested != null) {
      if (!this.branchScope.isBranchAllowed(user, requested)) throw new ForbiddenException('لا تملك صلاحية إعدادات هذا الفرع');
      return requested;
    }
    if (allowed?.length) return allowed[0];
    return undefined;
  }

  private readonly DEFAULTS: Record<string, Array<{ key: string; value: unknown; type: string }>> = {
    devices: [
      { key: 'autoSync', value: true, type: 'boolean' },
      { key: 'syncInterval', value: 300, type: 'number' },
    ],
    payment: [
      { key: 'allowMixedPayments', value: true, type: 'boolean' },
      { key: 'maxTransactionAmount', value: 50000, type: 'number' },
    ],
    invoice: [
      { key: 'autoNumbering', value: true, type: 'boolean' },
      { key: 'numberingFormat', value: 'QS-{######}', type: 'string' },
    ],
    security: [
      { key: 'requireLogin', value: true, type: 'boolean' },
      { key: 'sessionTimeout', value: 480, type: 'number' },
    ],
    inventory: [
      { key: 'warnLowStock', value: true, type: 'boolean' },
      { key: 'lowStockThreshold', value: 5, type: 'number' },
    ],
    notifications: [
      { key: 'enableEmail', value: false, type: 'boolean' },
      { key: 'enableSMS', value: false, type: 'boolean' },
    ],
    reports: [
      { key: 'defaultFormat', value: 'excel', type: 'string' },
      { key: 'autoGenerate', value: false, type: 'boolean' },
    ],
    booking: [
      { key: 'capacity', value: 10, type: 'number' },
    ],
    general: [
      { key: 'default_discount_percentage', value: 0, type: 'number' },
      { key: 'employee_discount_percentage', value: 0, type: 'number' },
      { key: 'employee_discount_enabled', value: true, type: 'boolean' },
      { key: 'employee_free_drinks_enabled', value: false, type: 'boolean' },
      { key: 'employee_free_drinks_daily', value: 1, type: 'number' },
      { key: 'employee_free_drink_categories', value: [], type: 'json' },
      { key: 'touch_keypad_enabled', value: false, type: 'boolean' },
      { key: 'partner_discount_percentage', value: 0, type: 'number' },
      { key: 'tax_rate', value: 15, type: 'number' },
      { key: 'enable_tax', value: true, type: 'boolean' },
      { key: 'inventory_tracking_enabled', value: true, type: 'boolean' },
      { key: 'currency', value: 'EGP', type: 'string' },
      { key: 'receipt_business_name', value: 'Noamany CLUB · CAFE', type: 'string' },
      { key: 'receipt_logo_url', value: '/noamany-logo.png', type: 'string' },
      { key: 'receipt_footer', value: 'شكراً لزيارتكم', type: 'string' },
    ],
  };

  async getCategory(category: string, branchId?: number, user?: JwtUser) {
    branchId = this.resolveBranch(user, branchId);
    let rows = await this.prisma.sales_pos_settings.findMany({
      where: { category, branch_id: branchId ?? null, is_active: true },
      orderBy: { sort_order: 'asc' },
    });
    if (rows.length === 0 && branchId != null) {
      rows = await this.prisma.sales_pos_settings.findMany({
        where: { category, branch_id: null, is_active: true },
        orderBy: { sort_order: 'asc' },
      });
    }
    if (rows.length === 0) {
      const defaults = this.DEFAULTS[category] ?? [];
      return defaults.map((d, i) => ({ key: d.key, value: d.value, type: d.type, sortOrder: i, isDefault: true }));
    }
    return rows.map((r) => ({
      key: r.setting_key,
      value: this.coerce(r.setting_value, r.setting_type),
      type: r.setting_type,
      description: r.description,
      sortOrder: r.sort_order,
    }));
  }

  async saveCategory(category: string, settings: Array<{ key: string; value: unknown; type?: string; description?: string }>, branchId?: number, userId?: number, user?: JwtUser) {
    branchId = this.resolveBranch(user, branchId);
    if (category === 'general') {
      const values = Object.fromEntries(settings.map((row) => [row.key, row.value]));
      for (const key of ['employee_discount_enabled', 'employee_free_drinks_enabled', 'touch_keypad_enabled']) {
        if (values[key] !== undefined && typeof values[key] !== 'boolean') throw new BadRequestException('قيمة التفعيل غير صحيحة');
      }
      if (values.employee_free_drinks_daily !== undefined && (typeof values.employee_free_drinks_daily !== 'number' || !Number.isInteger(values.employee_free_drinks_daily) || values.employee_free_drinks_daily < 1 || values.employee_free_drinks_daily > 100)) throw new BadRequestException('عدد المشروبات اليومي يجب أن يكون من 1 إلى 100');
      const ids = values.employee_free_drink_categories;
      if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id) || id < 1))) throw new BadRequestException('أقسام المشروبات غير صحيحة');
      if (values.employee_free_drinks_enabled === true && (!Array.isArray(ids) || !ids.length || values.employee_free_drinks_daily === undefined)) throw new BadRequestException('حدد عدد المشروبات وأقسامها قبل تفعيل المجاني');
    }
    await this.prisma.$transaction(async (tx) => {
    await tx.sales_pos_settings.deleteMany({ where: { category, branch_id: branchId ?? null } });
    await tx.sales_pos_settings.createMany({
      data: settings.map((s, i) => ({
        category,
        branch_id: branchId ?? null,
        setting_key: s.key,
        setting_value: JSON.stringify(s.value),
        setting_type: (s.type as 'string') ?? 'string',
        description: s.description,
        sort_order: i,
        created_by: userId,
      })),
    });
    });
    return this.getCategory(category, branchId, user);
  }

  async copyToBranch(category: string, fromBranchId: number, toBranchId: number, userId?: number, user?: JwtUser) {
    this.resolveBranch(user, fromBranchId);
    this.resolveBranch(user, toBranchId);
    const src = await this.getCategory(category, fromBranchId, user);
    const settings = src.map((s) => ({ key: s.key, value: s.value, type: s.type, description: s.description }));
    return this.saveCategory(category, settings, toBranchId, userId, user);
  }

  async resetCategory(category: string, branchId?: number, user?: JwtUser) {
    branchId = this.resolveBranch(user, branchId);
    await this.prisma.sales_pos_settings.deleteMany({ where: { category, branch_id: branchId ?? null } });
    return this.getCategory(category, branchId, user);
  }

  private coerce(val: string, type: string): unknown {
    try {
      if (type === 'boolean') {
        if (val === 'true' || val === 'false') return val === 'true';
        return Boolean(JSON.parse(val));
      }
      if (type === 'number') {
        const direct = Number(val);
        if (Number.isFinite(direct) && val.trim() !== '') return direct;
        return Number(JSON.parse(val));
      }
      if (type === 'json' || type === 'array') return JSON.parse(val);
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        return JSON.parse(val);
      }
      return val;
    } catch {
      return val;
    }
  }

  /** Read a numeric setting from DB or category defaults. */
  async getNumericSetting(
    category: string,
    key: string,
    branchId?: number,
  ): Promise<number | null> {
    const row = await this.prisma.sales_pos_settings.findFirst({
      where: {
        category,
        setting_key: key,
        branch_id: branchId ?? null,
        is_active: true,
      },
    });
    if (row) {
      const v = this.coerce(row.setting_value, row.setting_type);
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    if (branchId != null) {
      const globalRow = await this.prisma.sales_pos_settings.findFirst({
        where: { category, setting_key: key, branch_id: null, is_active: true },
      });
      if (globalRow) {
        const value = this.coerce(globalRow.setting_value, globalRow.setting_type);
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      }
    }
    const fallback = (this.DEFAULTS[category] ?? []).find((d) => d.key === key);
    if (fallback && typeof fallback.value === 'number') return fallback.value;
    return null;
  }

  async getBooleanSetting(
    category: string,
    key: string,
    branchId?: number,
  ): Promise<boolean | null> {
    const row = await this.prisma.sales_pos_settings.findFirst({
      where: {
        category,
        setting_key: key,
        branch_id: branchId ?? null,
        is_active: true,
      },
    });
    if (row) return this.coerce(row.setting_value, row.setting_type) === true;
    if (branchId != null) {
      const globalRow = await this.prisma.sales_pos_settings.findFirst({
        where: { category, setting_key: key, branch_id: null, is_active: true },
      });
      if (globalRow) return this.coerce(globalRow.setting_value, globalRow.setting_type) === true;
    }
    const fallback = (this.DEFAULTS[category] ?? []).find((item) => item.key === key);
    return fallback && typeof fallback.value === 'boolean' ? fallback.value : null;
  }

  /** VAT rate from pos-settings/general (falls back to 15%). */
  async getTaxRate(branchId?: number): Promise<number> {
    const rate = await this.getNumericSetting('general', 'tax_rate', branchId);
    return rate ?? 15;
  }

  async isTaxEnabled(branchId?: number): Promise<boolean> {
    const row = await this.prisma.sales_pos_settings.findFirst({
      where: { category: 'general', setting_key: 'enable_tax', branch_id: branchId ?? null, is_active: true },
    });
    if (row) return this.coerce(row.setting_value, row.setting_type) === true;
    if (branchId != null) {
      const globalRow = await this.prisma.sales_pos_settings.findFirst({
        where: { category: 'general', setting_key: 'enable_tax', branch_id: null, is_active: true },
      });
      if (globalRow) return this.coerce(globalRow.setting_value, globalRow.setting_type) === true;
    }
    const fallback = (this.DEFAULTS.general ?? []).find((d) => d.key === 'enable_tax');
    return fallback?.value === true;
  }

  async isInventoryTrackingEnabled(branchId?: number): Promise<boolean> {
    return (await this.getBooleanSetting('general', 'inventory_tracking_enabled', branchId)) ?? true;
  }
}
