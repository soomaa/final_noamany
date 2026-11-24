import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * WhatsApp message templates for subscriptions (ported from Meta Fit's «قوالب واتساب»).
 *
 * Stored without a schema change in the key/value table `sales_pos_settings`, under its own
 * category, one row per template (branch_id NULL = the whole club). Only edited templates are
 * stored; the frontend owns the default texts and falls back to them for a missing row.
 */
export const WHATSAPP_TEMPLATE_CATEGORY = 'club_whatsapp_templates';

export const WHATSAPP_TEMPLATE_KINDS = [
  'subscription',
  'renewal',
  'payment',
  'freeze',
  'unfreeze',
  'transfer',
  'current_subscriptions',
  'current_subscription_item',
  'expiring',
  'expired',
  'package_details',
] as const;
export type WhatsAppTemplateKind = (typeof WHATSAPP_TEMPLATE_KINDS)[number];

export const WHATSAPP_TEMPLATE_FIELDS = [
  'member_name', 'gym_name', 'member_code', 'branch_name', 'today',
  'package_name', 'subscription_number', 'status', 'registration_date', 'start_date', 'end_date',
  'days_left', 'days_since_expiry', 'subscription_value', 'discount_amount', 'net_amount',
  'paid_amount', 'remaining_amount', 'payment_amount', 'receipt_number', 'coach_name',
  'sessions_left', 'invitations_left', 'benefits', 'freeze_start', 'freeze_end',
  'previous_package', 'refund_amount', 'subscriptions', 'subscriptions_count', 'duration', 'offer',
] as const;

export const WHATSAPP_TEMPLATE_MAX_LENGTH = 3000;

const FIELD_SET = new Set<string>(WHATSAPP_TEMPLATE_FIELDS);

/** Non-empty, ≤3000 chars, and every `{{…}}` is a known field; no stray braces. */
export function validWhatsAppTemplate(text: unknown): text is string {
  if (typeof text !== 'string' || !text.trim() || text.length > WHATSAPP_TEMPLATE_MAX_LENGTH) return false;
  const stripped = text.replace(/\{\{([a-z_]+)\}\}/g, (token, field: string) => (FIELD_SET.has(field) ? '' : token));
  return !/[{}]/.test(stripped);
}

export type WhatsAppTemplatePatch = Partial<Record<WhatsAppTemplateKind, string | null>>;

@Injectable()
export class ClubWhatsAppTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saved (edited) templates only, keyed by kind. */
  async get(): Promise<Partial<Record<WhatsAppTemplateKind, string>>> {
    const rows = await this.prisma.sales_pos_settings.findMany({
      where: { category: WHATSAPP_TEMPLATE_CATEGORY, branch_id: null, is_active: true },
      select: { setting_key: true, setting_value: true },
      orderBy: { id: 'asc' },
    });
    const result: Partial<Record<WhatsAppTemplateKind, string>> = {};
    for (const row of rows) {
      const kind = row.setting_key as WhatsAppTemplateKind;
      // A row edited elsewhere into an invalid text is ignored (the default is used instead).
      if ((WHATSAPP_TEMPLATE_KINDS as readonly string[]).includes(kind) && validWhatsAppTemplate(row.setting_value)) {
        result[kind] = row.setting_value;
      }
    }
    return result;
  }

  /** Save the given templates; `null` restores that template's default text. */
  async update(patch: unknown, userId?: number) {
    const templates = this.validate(patch);
    await this.prisma.$transaction(async (tx) => {
      for (const [kind, text] of Object.entries(templates) as [WhatsAppTemplateKind, string | null][]) {
        // branch_id NULL defeats the unique index in MySQL, so find-then-write instead of upsert.
        const existing = await tx.sales_pos_settings.findMany({
          where: { category: WHATSAPP_TEMPLATE_CATEGORY, branch_id: null, setting_key: kind },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        if (text === null) {
          if (existing.length) await tx.sales_pos_settings.deleteMany({ where: { id: { in: existing.map((row) => row.id) } } });
          continue;
        }
        const [first, ...duplicates] = existing;
        if (duplicates.length) await tx.sales_pos_settings.deleteMany({ where: { id: { in: duplicates.map((row) => row.id) } } });
        if (first) {
          await tx.sales_pos_settings.update({
            where: { id: first.id },
            data: { setting_value: text, is_active: true, updated_by: userId ?? null },
          });
        } else {
          await tx.sales_pos_settings.create({
            data: {
              branch_id: null,
              category: WHATSAPP_TEMPLATE_CATEGORY,
              setting_key: kind,
              setting_value: text,
              setting_type: 'string',
              description: 'قالب رسالة واتساب',
              group_name: 'whatsapp',
              sort_order: WHATSAPP_TEMPLATE_KINDS.indexOf(kind),
              created_by: userId ?? null,
              updated_by: userId ?? null,
            },
          });
        }
      }
    });
    return this.get();
  }

  private validate(patch: unknown): WhatsAppTemplatePatch {
    const body = patch && typeof patch === 'object' && !Array.isArray(patch)
      ? (patch as { templates?: unknown }).templates
      : undefined;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('أرسل القوالب داخل templates');
    }
    const result: WhatsAppTemplatePatch = {};
    for (const [kind, text] of Object.entries(body as Record<string, unknown>)) {
      if (!(WHATSAPP_TEMPLATE_KINDS as readonly string[]).includes(kind)) {
        throw new BadRequestException(`نوع قالب غير معروف: ${kind}`);
      }
      if (text === null) {
        result[kind as WhatsAppTemplateKind] = null;
        continue;
      }
      if (!validWhatsAppTemplate(text)) {
        throw new BadRequestException('نص الرسالة فاضي أو أطول من ٣٠٠٠ حرف أو فيه متغير غير معروف');
      }
      result[kind as WhatsAppTemplateKind] = text;
    }
    if (!Object.keys(result).length) throw new BadRequestException('لا توجد قوالب للحفظ');
    return result;
  }
}
