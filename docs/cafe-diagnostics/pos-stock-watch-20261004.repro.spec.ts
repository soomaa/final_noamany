// Characterization of the specific POS watch service. These tests reproduce
// read skew with independent query snapshots; no live DB or browser is involved.
import { PosStockWatchService } from '../../backend/src/modules/sales/pos-stock-watch.service';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const compiledPath = require.resolve('../../backend/dist/modules/sales/pos-stock-watch.service.js');
const deployedService = require(compiledPath).PosStockWatchService;

function fixture(balanceFirst: boolean, Service = PosStockWatchService) {
  const sale = { product_id: 36, quantity: -11, doc_type: 'cafe_sale', doc_ref: 'TEST-ONLY',
    movement_date: new Date('2026-10-04T17:00:00Z') };
  let balance = 176;
  let movements: any[] = [];
  let firstRead = true;
  let unlock!: () => void;
  const movementRead = new Promise<void>(resolve => { unlock = resolve; });
  const prisma: any = {
    inv_warehouses: { findFirst: async () => ({ id: 1 }) },
    sales_pos_settings: { findFirst: async () => ({ setting_value: '[36]' }) },
    inv_products: { findMany: async () => [{ id: 36, name_ar: 'مياه كبيرة', product_code: 'WATER', unit_of_measure: 'piece' }] },
    inv_stock_balances: { findMany: async () => {
      if (firstRead && !balanceFirst) await movementRead;
      const captured = balance;
      if (firstRead && balanceFirst) { balance = 165; movements = [sale]; }
      return [{ product_id: 36, current_stock: captured }];
    } },
    inv_movements: { findMany: async () => {
      const captured = [...movements];
      if (firstRead && !balanceFirst) { balance = 165; movements = [sale]; unlock(); }
      firstRead = false;
      return captured;
    } },
  };
  const service = new Service(prisma,
    { findBranchSessionForSale: async () => ({ id: 1, shift_id: 1, start_time: new Date('2026-10-04T16:00:00Z') }) } as never,
    { isBranchAllowed: () => true } as never);
  return { service };
}

it('the compiled service is byte-identical to the deployed file reported at 18:57 UTC', () => {
  expect(createHash('sha256').update(readFileSync(compiledPath)).digest('hex'))
    .toBe('fefc75cc1fc7d860f72d74f1275ba8cc614a7bb8adb3caabfd41f67d57377f8d');
});

describe.each([['source', PosStockWatchService], ['deployed-matching compiled file', deployedService]])('POS stock-watch snapshot consistency: %s', (_label, Service) => {
  it('the small opening-shift figure can jump 165 -> 176 while the big actual-stock figure stays 165', async () => {
    const { service } = fixture(false, Service);
    const first = (await service.watch(1)).items[0];
    expect(first).toMatchObject({ balanceNow: 165, balanceAtShiftStart: 165, soldThisShift: 0 });
    const next = (await service.watch(1)).items[0];
    expect(next).toMatchObject({ balanceNow: 165, balanceAtShiftStart: 176, soldThisShift: 11 });
  });

  it('the reverse read order temporarily inflates opening-shift stock by the concurrent sale', async () => {
    const { service } = fixture(true, Service);
    const first = (await service.watch(1)).items[0];
    expect(first).toMatchObject({ balanceNow: 176, balanceAtShiftStart: 187, soldThisShift: 11 });
    const next = (await service.watch(1)).items[0];
    expect(next).toMatchObject({ balanceNow: 165, balanceAtShiftStart: 176, soldThisShift: 11 });
  });
});
