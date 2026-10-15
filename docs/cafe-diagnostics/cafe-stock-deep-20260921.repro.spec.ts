// Characterization only. Passing reproduces a defect/risk, not an acceptance test.
// No network or database connection. Decimal fixture models schema DECIMAL(14,3)
// storage using MySQL's documented half-away-from-zero rule.
import { Prisma } from '@prisma/client';
import { InventoryStockService } from '../../backend/src/modules/inventory/inventory-stock.service';
import { StockTakingService } from '../../backend/src/modules/inventory/stock-taking.service';
import { QuickSalesService } from '../../backend/src/modules/sales/quick-sales.service';
import { CafeProductsService } from '../../backend/src/modules/cafe/cafe-products.service';
import { retryOnUniqueViolation } from '../../backend/src/common/retry-unique';

const d3 = (n: any) => new Prisma.Decimal(n).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
function decimalStock() {
  let balance = d3(1); const movements: any[] = [];
  const tx: any = {
    inv_products: { findUnique: async () => ({ min_stock: 0, max_stock: 100, reorder_point: 0 }) },
    inv_stock_balances: {
      upsert: async () => ({ id: 1, current_stock: balance }),
      update: async ({ data }: any) => {
        balance = d3(balance.plus(data.current_stock.increment));
        return { id: 1, current_stock: balance };
      },
    },
    inv_movements: { create: async ({ data }: any) => { movements.push({ ...data, quantity: d3(data.quantity) }); } },
  };
  const service = new InventoryStockService({} as never);
  const move = (quantity: number, direction = 'out') => service.applyMovement({
    productId: 1, warehouseId: 1, quantity, direction, txnType: 'issue', docType: 'audit',
  } as any, tx);
  return { move, movements, balance: () => Number(balance) };
}

function countFixture() {
  const items: any[] = []; let currentStock = 100;
  const prisma: any = {
    inv_stock_balances: { findUnique: async () => ({ current_stock: currentStock }) },
    inv_count_items: {
      create: async ({ data }: any) => { const row = { ...data, id: items.length + 1 }; items.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(items.find(i => i.id === where.id), data),
    },
    inv_adjustments: {
      findUnique: async () => ({ id: 1, status: 'pending', adjustment_number: 'AUDIT',
        session: { id: 1, branch_id: 1, warehouse_id: 1, items } }),
      updateMany: async () => ({ count: 1 }),
    },
    inv_products: { findMany: async () => [{ id: 1, cost_price: 1 }] },
    inv_count_sessions: { update: async () => ({}) },
  };
  prisma.$transaction = async cb => cb(prisma);
  const stock = { applyMovement: async (dto: any) => {
    currentStock += (dto.direction === 'out' ? -1 : 1) * dto.quantity;
  } };
  const service: any = new StockTakingService(prisma, stock as never, {} as never,
    { postInventoryCountAdjustment: async () => {} } as never);
  service.findSession = async () => ({ id: 1, status: 'draft', warehouseId: 1,
    items: items.map(i => ({ id: i.id, productId: i.product_id, systemQuantity: i.system_quantity })) });
  return { service, items, stock: () => currentStock, sell: (n: number) => { currentStock -= n; } };
}

describe('Deep stock audit', () => {
  it('7.5g in kg creates divergent rounded balance and ledger; cancellation adds 1g', async () => {
    const f = decimalStock(); await f.move(0.0075);
    expect(f.balance()).toBe(0.993);
    expect(Number(f.movements[0].quantity)).toBe(-0.008);
    expect(f.balance()).not.toBe(1 + Number(f.movements[0].quantity));
    await f.move(Math.abs(Number(f.movements[0].quantity)), 'in');
    expect(f.balance()).toBe(1.001);
  });
  it('0.4g consumption in kg disappears at persisted 3-decimal precision', async () => {
    const f = decimalStock(); await f.move(0.0004);
    expect(f.balance()).toBe(1); expect(f.movements[0].quantity.isZero()).toBe(true);
  });
  it('simultaneous duplicate count lines apply the same shortage twice', async () => {
    const f = countFixture();
    const dto = { productId: 1, itemName: 'water', countedQuantity: 90, varianceReason: 'count' };
    await Promise.all([f.service.addCountItem(1, dto), f.service.addCountItem(1, dto)]);
    expect(f.items).toHaveLength(2);
    await f.service.approveAdjustment(1, 9);
    expect(f.stock()).toBe(80); // physical count was 90
  });
  it('recounting an existing line after sales retains the old system snapshot', async () => {
    const f = countFixture();
    await f.service.addCountItem(1, { productId: 1, itemName: 'water', countedQuantity: 95, varianceReason: 'count' });
    f.sell(10); // system 90, physical 85
    await f.service.updateCountItem(1, 1, { productId: 1, itemName: 'water', countedQuantity: 85, varianceReason: 'recount' });
    await f.service.approveAdjustment(1, 9);
    expect(f.stock()).toBe(75); // expected physical 85, the 10 sales were counted twice
  });
  it('manufacturing consumes raw ingredients, but subsequent sale consumes raws again and leaves the manufactured stock', async () => {
    const raw = { id: 1, name_ar: 'milk', unit_of_measure: 'L', cost_price: 10,
      inventory_kind: 'raw_material', is_deleted: false, status: 'active' };
    const composite = { ...raw, id: 2, name_ar: 'mix', inventory_kind: 'manufactured_internal' };
    const recipe = { ingredient_id: 1, ingredient: raw, quantity: 1, unit: 'L' };
    const product = { id: 7, name: 'mix', product_type: 'internal', inventory_product: composite, recipes: [recipe] };
    const balances = new Map([[1, 10], [2, 0]]);
    const tx: any = { cafe_products: { findUnique: async () => product, findFirst: async () => product },
      inv_transactions: { create: async () => ({ id: 4 }) },
      inv_stock_balances: { findUnique: async ({ where }: any) => ({ current_stock: balances.get(where.product_id_warehouse_id.product_id) }) },
      inv_products: { update: async () => ({}) } };
    tx.$transaction = async cb => cb(tx);
    const stock = { applyMovement: async (dto: any) => {
      balances.set(dto.productId, balances.get(dto.productId)! + (dto.direction === 'out' ? -1 : 1) * dto.quantity);
    } };
    const manufacturing: any = new CafeProductsService(tx, stock as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    manufacturing.resolveWarehouse = async () => 1;
    manufacturing.generateManufacturingNumber = async () => 'M-AUDIT';
    await manufacturing.produce(7, { branchId: 1, quantity: 1 }, 9);
    expect(balances.get(1)).toBe(9); expect(balances.get(2)).toBe(1);
    const sales: any = new QuickSalesService(tx, stock as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const consumption = await sales.resolvePreparedConsumption([
      { ingredient_id: 2, ingredient: composite, quantity: 1, unit: 'L' },
    ], 1);
    for (const line of consumption) await stock.applyMovement({ ...line, direction: 'out' });
    expect(balances.get(1)).toBe(8); expect(balances.get(2)).toBe(1);
  });
  it.each(['P2034', 'P2028'])('sale retry helper does not retry %s', async code => {
    const error = new Prisma.PrismaClientKnownRequestError('audit simulated failure', { code, clientVersion: '5.22.0' });
    const operation = jest.fn().mockRejectedValue(error);
    await expect(retryOnUniqueViolation(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
