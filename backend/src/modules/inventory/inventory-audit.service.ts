import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toNumber } from './inventory.utils';

/**
 * "سجل ومشاكل المخزون" — one place that explains, in plain language, every condition that makes
 * café stock look wrong, plus a timeline of who changed inventory and when.
 *
 * Issues are computed live from the data (nothing is cached or stored), so fixing the cause makes
 * the issue disappear on the next load.
 */
export type IssueSeverity = 'critical' | 'warning' | 'info';
export type IssueKind =
  | 'deleted_ingredient_in_recipe'
  | 'ready_product_unlinked'
  | 'prepared_without_recipe'
  | 'inventory_tracking_disabled'
  | 'negative_stock'
  | 'ghost_balance'
  | 'duplicate_count_lines';

export interface StockIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  count: number;
  items: Array<{ id: number | string; title: string; detail?: string; date?: string | null; subItems?: string[] }>;
}

export interface TimelineEvent {
  id: string;
  at: string;
  category: 'delete' | 'restore' | 'recipe' | 'edit' | 'count' | 'maintenance' | 'create';
  actor: string | null;
  entityName: string | null;
  entityCode: string | null;
  action: string;
  detail: string | null;
  source: 'audit' | 'derived';
}

/** Audit entity types written by the mutation interceptor and by maintenance scripts. */
const AUDITED_ENTITY_TYPES = [
  'products',
  'cafe-products',
  'cafe-bundles',
  'stock-taking',
  'opening-stocks',
  'cafe-waste',
  'cafe_recipe_ingredient_relink',
  'cafe_recipe_ingredient_removal',
  'inventory_product_restore',
  'cafe_ingredient_swap',
];

const DAY = 86_400_000;

/**
 * Corrections applied by maintenance scripts are stored as approved count sessions (ONE80-…,
 * approved_by "SSH: …") so the ledger stays consistent — but nobody counted the shelf. They must
 * never be presented as the "last physical count".
 */
export function isSystemCorrection(adjustment: { adjustment_number: string; approved_by?: string | null }) {
  return adjustment.adjustment_number.startsWith('ONE80-') || (adjustment.approved_by ?? '').startsWith('SSH');
}

@Injectable()
export class InventoryAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: { dateFrom?: string; dateTo?: string }) {
    const [issues, timeline] = await Promise.all([this.issues(), this.timeline(query)]);
    const lastCount = await this.prisma.inv_adjustments.findFirst({
      where: {
        status: 'approved', approved_at: { not: null },
        NOT: [{ adjustment_number: { startsWith: 'ONE80-' } }, { approved_by: { startsWith: 'SSH' } }],
      },
      orderBy: { approved_at: 'desc' },
      select: { adjustment_number: true, approved_at: true },
    });
    return {
      generatedAt: new Date().toISOString(),
      counts: {
        critical: issues.filter((i) => i.severity === 'critical').reduce((s, i) => s + i.count, 0),
        warning: issues.filter((i) => i.severity === 'warning').reduce((s, i) => s + i.count, 0),
        info: issues.filter((i) => i.severity === 'info').reduce((s, i) => s + i.count, 0),
        blockedProducts: this.blockedProductCount(issues),
      },
      lastApprovedCount: lastCount ? { reference: lastCount.adjustment_number, at: lastCount.approved_at } : null,
      issues,
      timeline,
    };
  }

  private blockedProductCount(issues: StockIssue[]) {
    const names = new Set<string>();
    for (const issue of issues) {
      if (issue.kind === 'deleted_ingredient_in_recipe') issue.items.forEach((i) => i.subItems?.forEach((s) => names.add(s.split(' — ')[0].split(' / ')[0])));
      if (issue.kind === 'ready_product_unlinked' || issue.kind === 'prepared_without_recipe') issue.items.forEach((i) => names.add(i.title));
    }
    return names.size;
  }

  // ---------------------------------------------------------------- issues

  async issues(): Promise<StockIssue[]> {
    const unavailable: Prisma.inv_productsWhereInput = { OR: [{ is_deleted: true }, { status: { not: 'active' } }] };
    const [productRecipes, variantRecipes, readyUnlinked, preparedProducts, trackingOff, negatives, ghosts, openCounts] = await Promise.all([
      this.prisma.cafe_product_recipes.findMany({
        where: { ingredient: unavailable, product: { is_active: true } },
        select: { quantity: true, unit: true, ingredient: { select: { id: true, product_code: true, name_ar: true, is_deleted: true, updated_at: true } }, product: { select: { name: true, product_code: true } } },
      }),
      this.prisma.cafe_variant_recipes.findMany({
        where: { ingredient: unavailable, variant: { is_active: true, product: { is_active: true } } },
        select: { quantity: true, unit: true, ingredient: { select: { id: true, product_code: true, name_ar: true, is_deleted: true, updated_at: true } }, variant: { select: { name: true, product: { select: { name: true, product_code: true } } } } },
      }),
      this.prisma.cafe_products.findMany({
        where: { is_active: true, product_type: 'ready', OR: [{ inventory_product_id: null }, { inventory_product: unavailable }] },
        select: { id: true, name: true, product_code: true, inventory_product: { select: { name_ar: true, product_code: true } } },
      }),
      this.prisma.cafe_products.findMany({
        where: { is_active: true, product_type: 'prepared', recipes: { none: {} } },
        select: { id: true, name: true, product_code: true, variants: { where: { is_active: true }, select: { _count: { select: { recipes: true } } } } },
      }),
      this.prisma.sales_pos_settings.findMany({
        where: { category: 'general', setting_key: 'inventory_tracking_enabled', is_active: true },
        select: { id: true, branch_id: true, setting_value: true, updated_at: true },
      }),
      this.prisma.inv_stock_balances.findMany({
        where: { current_stock: { lt: 0 }, product: { is_deleted: false } },
        select: { id: true, current_stock: true, product: { select: { id: true, name_ar: true, product_code: true, unit_of_measure: true } } },
        take: 200,
      }),
      this.prisma.inv_stock_balances.findMany({
        where: { current_stock: { not: 0 }, product: { is_deleted: true } },
        select: { id: true, current_stock: true, product: { select: { id: true, name_ar: true, product_code: true, unit_of_measure: true, updated_at: true } } },
        take: 200,
      }),
      this.prisma.inv_count_sessions.findMany({
        where: { status: { in: ['draft', 'awaiting_approval'] } },
        select: { id: true, session_number: true, created_at: true, items: { select: { product_id: true, item_name: true } } },
      }),
    ]);

    const issues: StockIssue[] = [];

    // 1) Recipes still pointing at a deleted / inactive ingredient → the drink cannot be sold.
    const byIngredient = new Map<number, StockIssue['items'][number]>();
    const addRecipe = (ing: { id: number; product_code: string; name_ar: string; is_deleted: boolean; updated_at: Date }, label: string) => {
      const row = byIngredient.get(ing.id) ?? {
        id: ing.id,
        title: `${ing.name_ar} (${ing.product_code})`,
        detail: ing.is_deleted ? 'deleted' : 'inactive',
        date: ing.updated_at.toISOString(),
        subItems: [],
      };
      if (!row.subItems!.includes(label)) row.subItems!.push(label);
      byIngredient.set(ing.id, row);
    };
    for (const r of productRecipes) addRecipe(r.ingredient, `${r.product.name} — ${toNumber(r.quantity)} ${r.unit}`);
    for (const r of variantRecipes) addRecipe(r.ingredient, `${r.variant.product.name} / ${r.variant.name || '—'} — ${toNumber(r.quantity)} ${r.unit}`);
    if (byIngredient.size) issues.push({ kind: 'deleted_ingredient_in_recipe', severity: 'critical', count: byIngredient.size, items: [...byIngredient.values()] });

    // 2) Ready products whose stock item is missing / deleted → cannot be sold.
    if (readyUnlinked.length) issues.push({
      kind: 'ready_product_unlinked', severity: 'critical', count: readyUnlinked.length,
      items: readyUnlinked.map((p) => ({ id: p.id, title: p.name, detail: p.inventory_product ? `${p.inventory_product.name_ar} (${p.inventory_product.product_code})` : undefined })),
    });

    // 3) Prepared products without any recipe → cannot be sold.
    const noRecipe = preparedProducts.filter((p) => !p.variants.some((v) => v._count.recipes > 0));
    if (noRecipe.length) issues.push({
      kind: 'prepared_without_recipe', severity: 'critical', count: noRecipe.length,
      items: noRecipe.map((p) => ({ id: p.id, title: p.name, detail: p.product_code })),
    });

    // 4) Cashier-only mode: sales are recorded but NOTHING is deducted from stock.
    const off = trackingOff.filter((s) => ['false', '0', 'no', 'off'].includes(String(s.setting_value).trim().toLowerCase()));
    if (off.length) issues.push({
      kind: 'inventory_tracking_disabled', severity: 'warning', count: off.length,
      items: off.map((s) => ({ id: s.id, title: s.branch_id == null ? 'all' : String(s.branch_id), date: s.updated_at?.toISOString() ?? null })),
    });

    // 5) Negative balances: more was sold/issued than the system believes exists.
    if (negatives.length) issues.push({
      kind: 'negative_stock', severity: 'warning', count: negatives.length,
      items: negatives.map((b) => ({ id: b.product.id, title: `${b.product.name_ar} (${b.product.product_code})`, detail: `${toNumber(b.current_stock)} ${b.product.unit_of_measure}` })),
    });

    // 6) Duplicate lines in an open stock count → the same variance would be applied twice.
    const dup = openCounts.map((s) => {
      const seen = new Map<number, number>();
      for (const i of s.items) if (i.product_id != null) seen.set(i.product_id, (seen.get(i.product_id) ?? 0) + 1);
      const names = s.items.filter((i) => i.product_id != null && (seen.get(i.product_id) ?? 0) > 1).map((i) => i.item_name);
      return { s, names: [...new Set(names)] };
    }).filter((x) => x.names.length);
    if (dup.length) issues.push({
      kind: 'duplicate_count_lines', severity: 'critical', count: dup.length,
      items: dup.map(({ s, names }) => ({ id: s.id, title: s.session_number, date: s.created_at.toISOString(), subItems: names })),
    });

    // 7) Deleted items that still carry a balance (informational: hidden, never counted).
    if (ghosts.length) issues.push({
      kind: 'ghost_balance', severity: 'info', count: ghosts.length,
      items: ghosts.map((b) => ({ id: b.product.id, title: `${b.product.name_ar} (${b.product.product_code})`, detail: `${toNumber(b.current_stock)} ${b.product.unit_of_measure}`, date: b.product.updated_at.toISOString() })),
    });

    return issues;
  }

  // -------------------------------------------------------------- timeline

  async timeline(query: { dateFrom?: string; dateTo?: string }): Promise<TimelineEvent[]> {
    const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : new Date();
    const from = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : new Date(to.getTime() - 90 * DAY);
    const range = { gte: from, lte: to };

    const [audits, deletedProducts, adjustments] = await Promise.all([
      this.prisma.business_audit_log.findMany({
        where: {
          created_at: range,
          entity_type: { in: AUDITED_ENTITY_TYPES },
          NOT: { action: { endsWith: '.requested' } },
          AND: [{ NOT: { action: { startsWith: 'http.get' } } }],
        },
        select: { id: true, entity_type: true, entity_id: true, action: true, actor_user_id: true, actor_name: true, reason: true, after_json: true, created_at: true },
        orderBy: { created_at: 'desc' },
        take: 1500,
      }),
      this.prisma.inv_products.findMany({
        where: { is_deleted: true, updated_at: range },
        select: { id: true, product_code: true, name_ar: true, updated_at: true },
      }),
      this.prisma.inv_adjustments.findMany({
        where: { status: 'approved', approved_at: range },
        select: { id: true, adjustment_number: true, approved_at: true, approved_by: true, notes: true, session: { select: { items: { select: { item_name: true, variance: true } } } } },
        orderBy: { approved_at: 'desc' },
      }),
    ]);

    // Resolve names once.
    const userIds = new Set<number>();
    for (const a of audits) if (a.actor_user_id) userIds.add(a.actor_user_id);
    for (const a of adjustments) if (a.approved_by && /^\d+$/.test(a.approved_by)) userIds.add(Number(a.approved_by));
    const productIds = new Set<number>();
    const cafeIds = new Set<number>();
    for (const a of audits) {
      const n = Number(a.entity_id);
      if (!Number.isInteger(n)) continue;
      if (a.entity_type === 'products') productIds.add(n);
      if (a.entity_type === 'cafe-products') cafeIds.add(n);
    }
    const [users, products, cafe] = await Promise.all([
      this.prisma.users.findMany({ where: { user_id: { in: [...userIds] } }, select: { user_id: true, name: true, username: true } }),
      this.prisma.inv_products.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, name_ar: true, product_code: true } }),
      this.prisma.cafe_products.findMany({ where: { id: { in: [...cafeIds] } }, select: { id: true, name: true, product_code: true } }),
    ]);
    const userName = (id?: number | null, fallback?: string | null) => {
      if (id) { const u = users.find((x) => x.user_id === id); if (u) return u.name || u.username || `#${id}`; }
      return fallback ?? null;
    };

    const events: TimelineEvent[] = [];
    const auditedDeletes = new Set<string>();
    for (const a of audits) {
      const method = /^http\.(\w+)\.(committed|failed)$/.exec(a.action);
      const failed = method?.[2] === 'failed';
      const id = Number(a.entity_id);
      const prod = a.entity_type === 'products' ? products.find((p) => p.id === id) : undefined;
      const cp = a.entity_type === 'cafe-products' ? cafe.find((p) => p.id === id) : undefined;
      const base = {
        id: `audit-${a.id}`,
        at: a.created_at.toISOString(),
        actor: userName(a.actor_user_id, a.actor_name),
        entityName: prod?.name_ar ?? cp?.name ?? null,
        entityCode: prod?.product_code ?? cp?.product_code ?? null,
        source: 'audit' as const,
      };
      if (a.entity_type === 'cafe_recipe_ingredient_relink') { events.push({ ...base, category: 'recipe', action: 'relink', detail: a.reason ?? null }); continue; }
      if (a.entity_type === 'cafe_recipe_ingredient_removal') { events.push({ ...base, category: 'recipe', action: 'recipe_remove_ingredient', detail: a.reason ?? null }); continue; }
      if (a.entity_type === 'cafe_ingredient_swap') { events.push({ ...base, category: 'recipe', action: 'ingredient_swap', detail: a.reason ?? null }); continue; }
      if (a.entity_type === 'inventory_product_restore') { events.push({ ...base, category: 'restore', action: 'restore', detail: a.reason ?? null }); continue; }
      if (!method) { events.push({ ...base, category: 'maintenance', action: a.action, detail: a.reason ?? null }); continue; }
      const verb = method[1];
      if (a.entity_type === 'products' && verb === 'delete' && !failed) auditedDeletes.add(a.entity_id);
      const category: TimelineEvent['category'] =
        verb === 'delete' ? 'delete'
          : a.entity_type === 'stock-taking' ? 'count'
            : a.entity_type === 'cafe-products' || a.entity_type === 'cafe-bundles' ? 'recipe'
              : verb === 'post' ? 'create' : 'edit';
      events.push({ ...base, category, action: `${a.entity_type}|${verb}${failed ? '|failed' : ''}`, detail: null });
    }

    // Deletions made before auditing existed: derived from the row's last update.
    for (const p of deletedProducts) {
      if (auditedDeletes.has(String(p.id))) continue;
      events.push({
        id: `deleted-${p.id}`, at: p.updated_at.toISOString(), category: 'delete', actor: null,
        entityName: p.name_ar, entityCode: p.product_code, action: 'products|delete', detail: null, source: 'derived',
      });
    }

    for (const a of adjustments) {
      const items = a.session?.items ?? [];
      const short = items.filter((i) => toNumber(i.variance) < 0);
      const over = items.filter((i) => toNumber(i.variance) > 0);
      events.push({
        id: `adj-${a.id}`, at: (a.approved_at ?? new Date()).toISOString(), category: isSystemCorrection(a) ? 'maintenance' : 'count',
        actor: /^\d+$/.test(a.approved_by ?? '') ? userName(Number(a.approved_by)) : a.approved_by ?? null,
        entityName: a.adjustment_number, entityCode: null, action: isSystemCorrection(a) ? 'system_correction' : 'count_approved',
        detail: JSON.stringify({ lines: items.length, shortage: short.map((i) => `${i.item_name} ${toNumber(i.variance)}`), surplus: over.map((i) => `${i.item_name} +${toNumber(i.variance)}`) }),
        source: 'derived',
      });
    }

    return events.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 1500);
  }
}
