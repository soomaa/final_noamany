import { Prisma } from '@prisma/client';
import { QuickSalesService } from './quick-sales.service';
import { saleStockBalance } from './sale-stock-balance.util';

// Stateful transaction fixture: exercises the service, authoritative pricing and
// persisted movement history. External ledger/shift math has separate real tests.
describe('completed invoice editing', () => {
  function setup() {
    const item = { id: 10, quick_sale_id: 1, cafe_product_id: 7, cafe_variant_id: null, product_id: 44, inventory_product_id: 44,
      item_type: 'cafe', business_classification: 'protein', name: 'مياه', product_code: 'CP7', quantity: 2, unit_price: 15, line_total: 30, unit_cost: 5, line_cost: 10, free_quantity: 0,
      feedback: { rating: 4, comment: 'جيد' } };
    let state: any = { stock: 98, movements: [{ product_id: 44, warehouse_id: 2, direction: 'out', quantity: 2, unit_cost: 5 }],
      row: { id: 1, sale_number: 'QS-1', daily_number: 1, branch_id: 1, shift_session_id: 3, warehouse_id: 2, inventory_posted: true,
        sale_date: '2026-09-08', sale_time: '00:25:00', status: 'completed', sale_type: 'customer', employee_id: null, partner_id: null,
        billing_cycle: null, billing_status: 'not_applicable', subtotal: 30, total_amount: 30, collected_amount: 30, discount_amount: 0,
        discount_percentage: 0, tax_amount: 0, tax_percentage: 0, cost_total: 10, payment_method: 'cash', created_by: 9,
        updated_at: new Date('2026-09-08T01:00:00Z'), items: [item], payments: [{ method: 'cash', amount: 30 }], events: [] },
      session: { id: 3, status: 'open' }, statement: null };
    function clean(v: any): any { if (v instanceof Prisma.Decimal) return Number(v); if (v instanceof Date) return v; if (Array.isArray(v)) return v.map(clean); if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,clean(x)])); return v; }
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      sales_quick_sales: { findUnique: jest.fn(async () => structuredClone(state.row)), update: jest.fn(async ({data}) => {
        const {items, payments, events, ...fields} = clean(data);
        Object.assign(state.row, fields); state.row.updated_at = new Date(state.row.updated_at.getTime() + 1);
        if (payments) state.row.payments = payments.create;
        if (events) state.row.events.push({id: state.row.events.length+1, ...events.create});
        return structuredClone(state.row);
      }) },
      sales_quick_sale_items: {
        update: jest.fn(async ({where,data}) => Object.assign(state.row.items.find((i: any) => i.id === where.id),clean(data))),
        create: jest.fn(async ({data}) => state.row.items.push({id:99,...clean(data)})),
        deleteMany: jest.fn(async ({where}) => {state.row.items = state.row.items.filter((i: any) => !where.id.in.includes(i.id));}),
      },
      sales_pos_payments: { deleteMany: jest.fn(async () => {state.row.payments = [];}) },
      sales_billing_statement_items: { findUnique: jest.fn(async () => state.statement) },
      sales_shift_sessions: { findUnique: jest.fn(async () => state.session) },
      inv_movements: { findMany: jest.fn(async () => structuredClone(state.movements)) },
      fin_revenues: { upsert: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() }, fin_expenses: { upsert: jest.fn(), updateMany: jest.fn() },
    };
    let queue = Promise.resolve();
    const prisma: any = {
      ...tx,
      $transaction: jest.fn((run: any) => {
        const result = queue.then(async () => { const backup = structuredClone(state); try { return await run(tx); } catch (error) {state = backup; throw error;} });
        queue = result.then(() => undefined, () => undefined); return result;
      }),
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({branch_id:1}) },
      inv_products: { findMany: jest.fn().mockResolvedValue([]) },
      cafe_products: { findMany: jest.fn().mockResolvedValue([{ id:7, name:'مياه', product_code:'CP7', product_type:'ready', business_classification:'protein', inventory_product_id:44,
        sell_price:999, variants:[], recipes:[], inventory_product:{id:44,cost_price:5,name_ar:'مياه',unit_of_measure:'piece',status:'active',is_deleted:false} }]) },
      sales_pos_payment_methods: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const stock = { applyMovement: jest.fn(async (m: any) => { state.stock += (m.direction==='in'?1:-1)*Number(m.quantity); state.movements.push({product_id:m.productId,warehouse_id:m.warehouseId,direction:m.direction,quantity:Number(m.quantity),unit_cost:Number(m.unitCost)}); }) };
    const ledger = {ensureChart:jest.fn(),postQuickSale:jest.fn(),postQuickSaleEdit:jest.fn(),postQuickSaleRefund:jest.fn()};
    const sessions = {applySaleEditToSession:jest.fn(),findBranchSessionForSale:jest.fn(async()=>state.session),applySaleReversalToSession:jest.fn()};
    const permissions = {canAny:jest.fn().mockResolvedValue(true)};
    const payroll = {isSaleAllocated:jest.fn().mockResolvedValue(false)};
    const service = new QuickSalesService(prisma,stock as never,{} as never,sessions as never,ledger as never,
      {getNumericSetting:jest.fn().mockResolvedValue(0),isTaxEnabled:jest.fn().mockResolvedValue(true),getTaxRate:jest.fn().mockResolvedValue(14)} as never,
      {isBranchAllowed:(_u: any,b: number)=>b===1} as never, permissions as never, payroll as never);
    const availability = jest.spyOn(service as any, 'assertStockAvailability').mockImplementation(async () => undefined);
    const dto = (quantity=3,expectedRevision=0) => ({branchId:1,expectedRevision,paymentMethod:'cash',items:[{cafeProductId:7,name:'مياه',quantity}]});
    return {service,tx,prisma,stock,ledger,sessions,permissions,payroll,availability,dto,get state(){return state;}};
  }
  it('updates an existing legacy finance revenue row instead of creating another sale revenue', async () => {
    const f = setup();
    f.tx.fin_revenues.findFirst.mockResolvedValue({ id: 88 });
    await f.service.editCompleted(1, f.dto(), 9);
    expect(f.tx.fin_revenues.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 88 }, data: expect.objectContaining({ source_module: 'quick_sale', total_amount: 45 }) }));
    expect(f.tx.fin_revenues.upsert).not.toHaveBeenCalled();
  });
  it('updates same invoice, retained feedback and original price/tax; charges only final stock', async () => {
    const f=setup(); const result=await f.service.editCompleted(1,f.dto(),9);
    expect(result).toMatchObject({id:1,saleNumber:'QS-1',editRevision:1,totalAmount:45,taxAmount:0});
    expect(f.state.stock).toBe(97);
    expect(f.state.row.items[0]).toMatchObject({id:10,quantity:3,unit_price:15,feedback:{rating:4}});
    expect(f.sessions.applySaleEditToSession).toHaveBeenCalledWith(f.tx,3,expect.objectContaining({before:expect.objectContaining({totalAmount:30}),after:expect.objectContaining({totalAmount:45})}));
    expect(f.tx.fin_revenues.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{revenue_number:'SALE-QS-1'},update:expect.objectContaining({total_amount:45})}));
  });
  it('rejects replayed confirmation and simultaneous stale editors without a second stock deduction', async () => {
    const f=setup(); const results=await Promise.allSettled([f.service.editCompleted(1,f.dto(),9),f.service.editCompleted(1,f.dto(4),9)]);
    expect(results.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']);
    expect(f.state.stock).toBe(97); expect(f.state.row.events).toHaveLength(1);
    await expect(f.service.editCompleted(1,f.dto(),9)).rejects.toThrow('جهاز آخر');
    expect(f.state.stock).toBe(97);
  });
  it('successive decreases return only the outstanding quantity, including later refund balance', async () => {
    const f=setup(); await f.service.editCompleted(1,f.dto(3),9); await f.service.editCompleted(1,f.dto(1,1),9);
    expect(f.state.stock).toBe(99); expect(saleStockBalance(f.state.movements)[0]).toMatchObject({quantity:1,unit_cost:5});
    expect(f.state.row.total_amount).toBe(15); expect(f.state.row.events).toHaveLength(2);
  });
  it.each(['refunded','cancelled'] as const)('%s after an edit reverses the latest locked invoice exactly once', async status => {
    const f=setup(); const stale=structuredClone(f.state.row);
    await f.service.editCompleted(1,f.dto(3),9);
    // Simulate a reversal that read its preview just before the edit committed.
    f.tx.sales_quick_sales.findUnique.mockResolvedValueOnce(stale);
    await f.service.update(1,{status,notes:'تصحيح الطلب'},9);
    expect(f.state.stock).toBe(100);
    expect(f.sessions.applySaleReversalToSession).toHaveBeenCalledWith(f.tx,3,expect.objectContaining({totalAmount:45,collectedAmount:45}));
    expect(f.ledger.postQuickSaleRefund).toHaveBeenCalledWith(expect.objectContaining({totalAmount:45,returnedCogsAmount:15}),f.tx);
    await expect(f.service.update(1,{status,notes:'تكرار التصحيح'},9)).rejects.toThrow();
    expect(f.state.stock).toBe(100);
  });
  it('notes-only edits preserve original stock, cost and ready-product link after a master change', async () => {
    const f=setup();
    f.prisma.cafe_products.findMany.mockResolvedValue([{ id:7, name:'مياه', product_code:'CP7', product_type:'ready', business_classification:'bar', inventory_product_id:55,
      sell_price:999, variants:[], recipes:[], inventory_product:{id:55,cost_price:99,name_ar:'مياه',unit_of_measure:'piece',status:'active',is_deleted:false} }]);
    await f.service.editCompleted(1,{...f.dto(2),receiptComment:'بدون ثلج'},9);
    expect(f.stock.applyMovement).not.toHaveBeenCalled();
    expect(f.state.row).toMatchObject({cost_total:10,receipt_comment:'بدون ثلج'});
    expect(f.state.row.items[0]).toMatchObject({product_id:44,inventory_product_id:44,unit_cost:5,business_classification:'protein'});
  });
  it('rejects changing quantities after the original inventory link changed', async () => {
    const f=setup();
    f.prisma.cafe_products.findMany.mockResolvedValue([{ id:7, name:'مياه', product_code:'CP7', product_type:'ready', business_classification:'protein', inventory_product_id:55,
      sell_price:15, variants:[], recipes:[], inventory_product:{id:55,cost_price:5,name_ar:'مياه',unit_of_measure:'piece',status:'active',is_deleted:false} }]);
    await expect(f.service.editCompleted(1,f.dto(),9)).rejects.toThrow('وصفات');
    expect(f.stock.applyMovement).not.toHaveBeenCalled();expect(f.state.stock).toBe(98);
  });
  it('uses read-committed transactions so a statement committed while waiting is visible', async () => {
    const f=setup(); await f.service.editCompleted(1,f.dto(),9);
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'ReadCommitted'}));
  });
  it('rolls back restored stock and keeps the invoice when availability or ledger fails', async () => {
    const f=setup(); f.availability.mockRejectedValue(new Error('stock shortage'));
    await expect(f.service.editCompleted(1,f.dto(),9)).rejects.toThrow('stock shortage');
    expect(f.state.stock).toBe(98); expect(f.state.movements).toHaveLength(1); expect(f.state.row.total_amount).toBe(30);
    f.availability.mockResolvedValue(undefined); f.ledger.postQuickSaleEdit.mockRejectedValue(new Error('closed accounting period') as never);
    await expect(f.service.editCompleted(1,f.dto(),9)).rejects.toThrow('closed accounting period');
    expect(f.state.stock).toBe(98); expect(f.state.row.events).toHaveLength(0);
  });
  it.each(['closed','statement','refunded','branch','permission'])('rejects %s before changing stock', async reason => {
    const f=setup(); const dto=f.dto();
    if(reason==='closed') f.state.session.status='closed';
    if(reason==='statement') f.state.statement={id:1};
    if(reason==='refunded') f.state.row.status='refunded';
    if(reason==='branch') dto.branchId=2;
    if(reason==='permission') f.permissions.canAny.mockResolvedValue(false);
    await expect(f.service.editCompleted(1,dto,9)).rejects.toThrow();
    expect(f.stock.applyMovement).not.toHaveBeenCalled();expect(f.state.row.total_amount).toBe(30);
  });
  it('keeps cashier-only invoices free of new stock effects', async () => {
    const f=setup(); f.state.row.inventory_posted=false;f.state.row.warehouse_id=null;
    await f.service.editCompleted(1,f.dto(),9);
    expect(f.stock.applyMovement).not.toHaveBeenCalled();
    expect(f.ledger.postQuickSaleEdit).toHaveBeenCalledWith(expect.objectContaining({before:expect.objectContaining({cogsAmount:0}),after:expect.objectContaining({cogsAmount:0})}),f.tx);
  });
  it('blocks editing and refunding an invoice reserved for monthly payroll before stock changes', async () => {
    const f = setup();
    f.payroll.isSaleAllocated.mockResolvedValue(true);
    await expect(f.service.editCompleted(1, f.dto(3), 9)).rejects.toThrow('المرتبات');
    await expect(f.service.update(1, { status: 'refunded', notes: 'تصحيح الطلب' }, 9)).rejects.toThrow('المرتبات');
    expect(f.state.stock).toBe(98);
    expect(f.state.row.status).toBe('completed');
  });

});
