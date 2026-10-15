import { Prisma } from '@prisma/client';
import { InventoryAuditService } from './inventory-audit.service';

const d = (s: string) => new Date(s);
function fixture(overrides: Record<string, unknown> = {}) {
  const empty = { findMany: jest.fn().mockResolvedValue([]) };
  const prisma: any = {
    cafe_product_recipes: { findMany: jest.fn().mockResolvedValue([
      { quantity: new Prisma.Decimal(1), unit: 'piece', ingredient: { id: 113, product_code: 'PRD000077', name_ar: 'كوب كرتون سخن', is_deleted: true, updated_at: d('2026-08-01T15:53:00Z') }, product: { name: 'Espresso', product_code: 'CP-1' } },
      { quantity: new Prisma.Decimal(1), unit: 'piece', ingredient: { id: 113, product_code: 'PRD000077', name_ar: 'كوب كرتون سخن', is_deleted: true, updated_at: d('2026-08-01T15:53:00Z') }, product: { name: 'CORTO', product_code: 'CP-5' } },
    ]) },
    cafe_variant_recipes: { findMany: jest.fn().mockResolvedValue([
      { quantity: new Prisma.Decimal(1), unit: 'piece', ingredient: { id: 113, product_code: 'PRD000077', name_ar: 'كوب كرتون سخن', is_deleted: true, updated_at: d('2026-08-01T15:53:00Z') }, variant: { name: 'Large', product: { name: 'Espresso', product_code: 'CP-1' } } },
    ]) },
    cafe_products: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 9, name: 'Mystery', product_code: 'CP-9', variants: [] }]).mockResolvedValue([]) },
    sales_pos_settings: { findMany: jest.fn().mockResolvedValue([{ id: 1, branch_id: 1, setting_value: 'false', updated_at: d('2026-09-01T00:00:00Z') }]) },
    inv_stock_balances: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 1, current_stock: new Prisma.Decimal(264), product: { id: 113, name_ar: 'كوب كرتون سخن', product_code: 'PRD000077', unit_of_measure: 'piece', updated_at: d('2026-08-01T15:53:00Z') } },
    ]) },
    inv_count_sessions: { findMany: jest.fn().mockResolvedValue([{ id: 5, session_number: 'CNT5', created_at: d('2026-09-20T10:00:00Z'), items: [{ product_id: 1, item_name: 'مياه' }, { product_id: 1, item_name: 'مياه' }, { product_id: 2, item_name: 'لبن' }] }]) },
    inv_adjustments: { findFirst: jest.fn().mockResolvedValue({ adjustment_number: 'ADJ-CNT2', approved_at: d('2026-09-01T06:09:00Z') }), findMany: jest.fn().mockResolvedValue([
      { id: 2, adjustment_number: 'ADJ-CNT2', approved_at: d('2026-09-01T06:09:00Z'), approved_by: '19', notes: null, session: { items: [{ item_name: 'لبن', variance: new Prisma.Decimal(-52.7) }, { item_name: 'استيفيا', variance: new Prisma.Decimal(14) }] } },
    ]) },
    business_audit_log: { findMany: jest.fn().mockResolvedValue([
      { id: 10, entity_type: 'products', entity_id: '154', action: 'http.delete.committed', actor_user_id: 21, actor_name: null, reason: null, after_json: null, created_at: d('2026-09-21T10:00:00Z') },
      { id: 11, entity_type: 'inventory_product_restore', entity_id: '113,114', action: 'products.restore_deleted', actor_user_id: null, actor_name: 'one80 maintenance', reason: 'Restored', after_json: null, created_at: d('2026-09-23T10:00:00Z') },
    ]) },
    inv_products: { findMany: jest.fn()
      .mockResolvedValueOnce([{ id: 113, product_code: 'PRD000077', name_ar: 'كوب كرتون سخن', updated_at: d('2026-08-01T15:53:00Z') }, { id: 154, product_code: 'PRD000118', name_ar: 'Espresso', updated_at: d('2026-09-21T10:00:00Z') }])
      .mockResolvedValueOnce([{ id: 154, name_ar: 'Espresso', product_code: 'PRD000118' }]) },
    users: { findMany: jest.fn().mockResolvedValue([{ user_id: 21, name: 'كاشير الصباح', username: 'cash1' }, { user_id: 19, name: 'مدير الكافيه', username: 'mgr' }]) },
    ...overrides,
  };
  void empty;
  return { prisma, service: new InventoryAuditService(prisma) };
}

describe('InventoryAuditService', () => {
  it('explains every live stock problem in one list, grouped so each cause appears once', async () => {
    const { service } = fixture();
    const result = await service.summary({ dateFrom: '2026-07-01', dateTo: '2026-09-30' });
    const kinds = result.issues.map((i) => i.kind);
    expect(kinds).toEqual(['deleted_ingredient_in_recipe', 'prepared_without_recipe', 'inventory_tracking_disabled', 'duplicate_count_lines', 'ghost_balance']);
    const cup = result.issues[0].items[0];
    expect(cup).toMatchObject({ id: 113, detail: 'deleted' });
    expect(cup.subItems).toEqual(['Espresso — 1 piece', 'CORTO — 1 piece', 'Espresso / Large — 1 piece']);
    expect(result.issues.find((i) => i.kind === 'duplicate_count_lines')!.items[0].subItems).toEqual(['مياه']);
    // Espresso, CORTO (recipes) + Mystery (no recipe)
    expect(result.counts).toMatchObject({ critical: 3, warning: 1, info: 1, blockedProducts: 3 });
  });

  it('builds a readable timeline: who deleted, derived deletions without audit, count approvals and maintenance', async () => {
    const { service } = fixture();
    const { timeline } = await service.summary({ dateFrom: '2026-07-01', dateTo: '2026-09-30' });
    expect(timeline.map((e) => e.id)).toEqual(['audit-11', 'audit-10', 'adj-2', 'deleted-113']);
    expect(timeline[1]).toMatchObject({ category: 'delete', actor: 'كاشير الصباح', entityName: 'Espresso', source: 'audit' });
    expect(timeline[3]).toMatchObject({ category: 'delete', actor: null, entityName: 'كوب كرتون سخن', source: 'derived' });
    expect(timeline[2]).toMatchObject({ category: 'count', actor: 'مدير الكافيه' });
    expect(JSON.parse(timeline[2].detail!)).toEqual({ lines: 2, shortage: ['لبن -52.7'], surplus: ['استيفيا +14'] });
    expect(timeline[0]).toMatchObject({ category: 'restore', actor: 'one80 maintenance' });
  });
});
