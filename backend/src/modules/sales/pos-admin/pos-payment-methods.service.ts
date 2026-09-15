import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesPaymentMethod } from '@prisma/client';
import { paginated } from '../../../common/dto/list-result';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PosListQueryDto, UpsertPosPaymentMethodDto } from './dto/pos-admin.dto';

@Injectable()
export class PosPaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: number; name: string; name_en: string | null; code: string; base_method: SalesPaymentMethod; icon: string | null;
    fees: Prisma.Decimal; max_amount: Prisma.Decimal | null; min_amount: Prisma.Decimal | null;
    supports_mixed_payment: boolean; requires_reference: boolean; requires_approval: boolean;
    approval_threshold: Prisma.Decimal | null; provider_name: string | null;
    is_test_mode: boolean; description: string | null; is_enabled: boolean; sort_order: number;
  }) {
    return {
      id: row.id, name: row.name, nameEn: row.name_en, code: row.code, baseMethod: row.base_method, icon: row.icon,
      fees: Number(row.fees), maxAmount: row.max_amount != null ? Number(row.max_amount) : null,
      minAmount: row.min_amount != null ? Number(row.min_amount) : null,
      supportsMixedPayment: row.supports_mixed_payment, requiresReference: row.requires_reference,
      requiresApproval: row.requires_approval,
      approvalThreshold: row.approval_threshold != null ? Number(row.approval_threshold) : null,
      providerName: row.provider_name, isTestMode: row.is_test_mode, description: row.description,
      isEnabled: row.is_enabled, sortOrder: row.sort_order,
    };
  }

  async list(q: PosListQueryDto) {
    const where: Prisma.sales_pos_payment_methodsWhereInput = {};
    if (q.isActive != null) where.is_enabled = q.isActive;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ name: { contains: s } }, { code: { contains: s } }];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sales_pos_payment_methods.count({ where }),
      this.prisma.sales_pos_payment_methods.findMany({ where, skip: q.skip, take: q.take, orderBy: { sort_order: 'asc' } }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.sales_pos_payment_methods.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طريقة الدفع غير موجودة');
    return this.map(row);
  }

  async create(dto: UpsertPosPaymentMethodDto, userId: number) {
    const row = await this.prisma.sales_pos_payment_methods.create({
      data: {
        name: dto.name, name_en: dto.nameEn, code: dto.code, base_method: dto.baseMethod ?? SalesPaymentMethod.card, icon: dto.icon,
        fees: dto.fees ?? 0, max_amount: dto.maxAmount, min_amount: dto.minAmount,
        supports_mixed_payment: dto.supportsMixedPayment ?? true,
        requires_reference: dto.requiresReference ?? false,
        requires_approval: dto.requiresApproval ?? false,
        approval_threshold: dto.approvalThreshold,
        provider_name: dto.providerName, api_key: dto.apiKey, api_secret: dto.apiSecret,
        is_test_mode: dto.isTestMode ?? false, description: dto.description,
        is_enabled: dto.isEnabled ?? true, sort_order: dto.sortOrder ?? 0, created_by: userId,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertPosPaymentMethodDto>, userId: number) {
    await this.findOne(id);
    const row = await this.prisma.sales_pos_payment_methods.update({
      where: { id },
      data: {
        name: dto.name, name_en: dto.nameEn, code: dto.code, base_method: dto.baseMethod, icon: dto.icon,
        fees: dto.fees, max_amount: dto.maxAmount, min_amount: dto.minAmount,
        supports_mixed_payment: dto.supportsMixedPayment, requires_reference: dto.requiresReference,
        requires_approval: dto.requiresApproval,
        approval_threshold: dto.approvalThreshold, provider_name: dto.providerName,
        api_key: dto.apiKey, api_secret: dto.apiSecret, is_test_mode: dto.isTestMode,
        description: dto.description, is_enabled: dto.isEnabled, sort_order: dto.sortOrder,
        updated_by: userId,
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.sales_pos_payment_methods.delete({ where: { id } });
    return { ok: true };
  }

  async toggle(id: number, userId: number) {
    const row = await this.findOne(id);
    return this.update(id, { isEnabled: !row.isEnabled }, userId);
  }

  async testConnection(id: number) {
    const row = await this.prisma.sales_pos_payment_methods.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طريقة الدفع غير موجودة');
    if (!row.provider_name) return { ok: false, message: 'لا يوجد مزود مرتبط' };
    if (!row.api_key?.trim()) {
      return { ok: false, message: 'مفتاح API غير مُعرَّف — لا يمكن اختبار الاتصال' };
    }

    const start = Date.now();
    const provider = row.provider_name.toLowerCase();

    try {
      if (provider.includes('stripe')) {
        const res = await fetch('https://api.stripe.com/v1/balance', {
          method: 'GET',
          headers: { Authorization: `Bearer ${row.api_key}` },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (res.ok) {
          return { ok: true, message: `تم التحقق من Stripe بنجاح`, latencyMs };
        }
        return { ok: false, message: `فشل Stripe (${res.status})`, latencyMs };
      }

      if (provider.includes('tap') || provider.includes('moyasar')) {
        const base = provider.includes('tap')
          ? 'https://api.tap.company/v2/charges/list?limit=1'
          : 'https://api.moyasar.com/v1/payments?limit=1';
        const auth = row.api_secret?.trim()
          ? `Basic ${Buffer.from(`${row.api_key}:${row.api_secret}`).toString('base64')}`
          : `Bearer ${row.api_key}`;
        const res = await fetch(base, {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (res.status === 200 || res.status === 401) {
          const ok = res.status === 200;
          return {
            ok,
            message: ok
              ? `تم الاتصال بـ ${row.provider_name}`
              : `رفض الخادم بيانات الاعتماد (${res.status})`,
            latencyMs,
          };
        }
        return { ok: false, message: `فشل الاتصال (${res.status})`, latencyMs };
      }

      if (row.api_key.length < 8) {
        return { ok: false, message: 'مفتاح API قصير أو غير صالح', latencyMs: Date.now() - start };
      }

      return {
        ok: false,
        message: `لا يوجد اختبار آلي لمزود «${row.provider_name}» — تحقق من المفاتيح يدوياً`,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'فشل الاتصال',
        latencyMs: Date.now() - start,
      };
    }
  }

  async updateOrder(orderData: Array<{ id: number; sortOrder: number }>) {
    await this.prisma.$transaction(
      orderData.map((o) =>
        this.prisma.sales_pos_payment_methods.update({ where: { id: o.id }, data: { sort_order: o.sortOrder } }),
      ),
    );
    return { ok: true };
  }

  async stats() {
    const [total, enabled] = await Promise.all([
      this.prisma.sales_pos_payment_methods.count(),
      this.prisma.sales_pos_payment_methods.count({ where: { is_enabled: true } }),
    ]);
    return { total, enabled, disabled: total - enabled };
  }
}

@Injectable()
export class PosInvoiceTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: number; name: string; template_type: string; paper_size: string;
    include_header: boolean; include_logo: boolean; include_footer: boolean;
    include_qr: boolean; include_signature: boolean; header_text: string | null;
    footer_text: string | null; css_styles: string | null; layout_config: unknown;
    is_default: boolean; is_active: boolean; sort_order: number;
  }) {
    return {
      id: row.id, name: row.name, templateType: row.template_type, paperSize: row.paper_size,
      includeHeader: row.include_header, includeLogo: row.include_logo, includeFooter: row.include_footer,
      includeQr: row.include_qr, includeSignature: row.include_signature,
      headerText: row.header_text, footerText: row.footer_text, cssStyles: row.css_styles,
      layoutConfig: row.layout_config, isDefault: row.is_default, isActive: row.is_active, sortOrder: row.sort_order,
    };
  }

  async list(q: PosListQueryDto) {
    const where: Prisma.sales_pos_invoice_templatesWhereInput = {};
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.search?.trim()) where.name = { contains: q.search.trim() };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sales_pos_invoice_templates.count({ where }),
      this.prisma.sales_pos_invoice_templates.findMany({ where, skip: q.skip, take: q.take, orderBy: { sort_order: 'asc' } }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.sales_pos_invoice_templates.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('القالب غير موجود');
    return this.map(row);
  }

  async create(dto: import('./dto/pos-admin.dto').UpsertPosInvoiceTemplateDto, userId: number) {
    if (dto.isDefault) {
      await this.prisma.sales_pos_invoice_templates.updateMany({ data: { is_default: false } });
    }
    const row = await this.prisma.sales_pos_invoice_templates.create({
      data: {
        name: dto.name, template_type: (dto.templateType as 'simple') ?? 'simple',
        paper_size: dto.paperSize ?? 'A4', include_header: dto.includeHeader ?? true,
        include_logo: dto.includeLogo ?? true, include_footer: dto.includeFooter ?? true,
        include_qr: dto.includeQr ?? false, include_signature: dto.includeSignature ?? false,
        header_text: dto.headerText, footer_text: dto.footerText, css_styles: dto.cssStyles,
        layout_config: dto.layoutConfig as Prisma.InputJsonValue,
        is_default: dto.isDefault ?? false, is_active: dto.isActive ?? true,
        sort_order: dto.sortOrder ?? 0, created_by: userId,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<import('./dto/pos-admin.dto').UpsertPosInvoiceTemplateDto>, userId: number) {
    await this.findOne(id);
    if (dto.isDefault) {
      await this.prisma.sales_pos_invoice_templates.updateMany({ data: { is_default: false } });
    }
    const row = await this.prisma.sales_pos_invoice_templates.update({
      where: { id },
      data: {
        name: dto.name, template_type: dto.templateType as never, paper_size: dto.paperSize,
        include_header: dto.includeHeader, include_logo: dto.includeLogo, include_footer: dto.includeFooter,
        include_qr: dto.includeQr, include_signature: dto.includeSignature,
        header_text: dto.headerText, footer_text: dto.footerText, css_styles: dto.cssStyles,
        layout_config: dto.layoutConfig as Prisma.InputJsonValue,
        is_default: dto.isDefault, is_active: dto.isActive, sort_order: dto.sortOrder, updated_by: userId,
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    if (row.isDefault) throw new BadRequestException('لا يمكن حذف القالب الافتراضي');
    await this.prisma.sales_pos_invoice_templates.delete({ where: { id } });
    return { ok: true };
  }

  async setDefault(id: number, userId: number) {
    await this.prisma.sales_pos_invoice_templates.updateMany({ data: { is_default: false } });
    return this.update(id, { isDefault: true }, userId);
  }

  async duplicate(id: number, newName: string, userId: number) {
    const src = await this.prisma.sales_pos_invoice_templates.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('القالب غير موجود');
    const row = await this.prisma.sales_pos_invoice_templates.create({
      data: {
        name: newName,
        template_type: src.template_type,
        paper_size: src.paper_size,
        include_header: src.include_header,
        include_logo: src.include_logo,
        include_footer: src.include_footer,
        include_qr: src.include_qr,
        include_signature: src.include_signature,
        header_text: src.header_text,
        footer_text: src.footer_text,
        css_styles: src.css_styles,
        layout_config: src.layout_config ?? undefined,
        is_default: false,
        is_active: src.is_active,
        sort_order: src.sort_order,
        created_by: userId,
      },
    });
    return this.map(row);
  }

  preview(id: number, sampleData?: Record<string, unknown>) {
    const sample = sampleData ?? {
      saleNumber: 'QS-000001', customerName: 'عميل نقدي', total: 150.0,
      items: [{ name: 'بروتين', qty: 1, price: 150 }],
    };
    return { templateId: id, preview: sample, renderedAt: new Date().toISOString() };
  }

  async stats() {
    const [total, active, defaults] = await Promise.all([
      this.prisma.sales_pos_invoice_templates.count(),
      this.prisma.sales_pos_invoice_templates.count({ where: { is_active: true } }),
      this.prisma.sales_pos_invoice_templates.count({ where: { is_default: true } }),
    ]);
    return { total, active, defaults };
  }
}

