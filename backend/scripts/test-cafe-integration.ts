import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { InventoryLocationService } from '../src/modules/inventory/inventory-location.service';
import { InventoryStockService } from '../src/modules/inventory/inventory-stock.service';
import { WarehousesService } from '../src/modules/inventory/warehouses.service';
import { InventoryTransactionsService } from '../src/modules/inventory/inventory-transactions.service';
import { InventoryMovementsService } from '../src/modules/inventory/inventory-movements.service';
import { StockTakingService } from '../src/modules/inventory/stock-taking.service';
import { SupplierInvoicesService } from '../src/modules/procurement/supplier-invoices.service';
import { SupplierPaymentsService } from '../src/modules/procurement/supplier-payments.service';
import { PurchaseReturnsService } from '../src/modules/procurement/purchase-returns.service';
import { AccountsService } from '../src/modules/accounting/accounts.service';
import { LedgerService } from '../src/modules/accounting/ledger.service';
import { ModuleLedgerService } from '../src/modules/accounting/module-ledger.service';
import { QuickSalesService } from '../src/modules/sales/quick-sales.service';
import { ShiftSessionsService } from '../src/modules/sales/shift-sessions.service';
import { BranchScopeService } from '../src/common/branch-scope/branch-scope.service';
import { localDateString } from '../src/modules/sales/sales.utils';

/** Real MySQL + real stock/accounting services. Never writes to the configured database. */
async function main() {
  const envLine = readFileSync(resolve('.env'), 'utf8').split(/\r?\n/).find((s) => s.startsWith('DATABASE_URL='));
  const sourceUrl = new URL(envLine!.slice(envLine!.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, ''));
  assert(['127.0.0.1', 'localhost', '::1'].includes(sourceUrl.hostname), 'Integration test requires a local MySQL server');
  const dbName = `codex_cafe_test_${randomBytes(6).toString('hex')}`;
  const baselinePath = resolve('prisma', `.cafe-test-${randomBytes(6).toString('hex')}.prisma`);
  const admin = new PrismaClient({ datasources: { db: { url: sourceUrl.toString() } } });
  const testUrl = new URL(sourceUrl); testUrl.pathname = `/${dbName}`;
  let db: PrismaClient | undefined;
  let created = false;
  const checks: string[] = [];
  const passed = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    const root = resolve('..');
    const baseline = execFileSync('git', ['-c', `safe.directory=${root.replace(/\\/g,'/')}`, 'show', 'HEAD:backend/prisma/schema.prisma']);
    writeFileSync(baselinePath, baseline);
    db = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
    // Keep the real schema and FK constraints, but omit unrelated HR/CMS tables.
    const baselineSql = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', baselinePath, '--script'], { env: { ...process.env, DATABASE_URL: testUrl.toString() }, maxBuffer: 16 * 1024 * 1024 }).toString('utf8');
    const statements = baselineSql.split(';').map((s) => s.trim()).filter(Boolean);
    const selected = new Set(`tbl_branches users employees business_audit_log acc_accounts acc_default_accounts acc_settings acc_accounting_periods acc_journal_entries acc_journal_entry_lines inv_warehouses inv_categories inv_products inv_product_branches inv_stock_balances inv_movements inv_suppliers inv_supplier_products inv_transactions inv_transaction_items inv_adjustments inv_count_sessions inv_count_items prc_supplier_invoices prc_supplier_invoice_items prc_supplier_payments prc_purchase_returns prc_purchase_return_items cafe_partners cafe_products sales_quick_sales sales_quick_sale_items sales_pos_payments sales_shifts sales_shift_sessions sales_shift_sale_adjustments sales_cash_drawer_transactions sales_booking_payments sales_invoice_feedback sales_invoice_item_feedback sales_pos_payment_methods`.split(' '));
    selected.add('cafe_product_recipes');
    selected.add('cafe_product_variants');
    selected.add('cafe_variant_recipes');
    selected.add('sales_invoice_events');
    selected.add('fin_expenses');
    let previousSize = -1;
    while (previousSize !== selected.size) {
      previousSize = selected.size;
      for (const statement of statements) {
        const table = statement.match(/ALTER TABLE `([^`]+)`/);
        if (table && selected.has(table[1])) for (const match of statement.matchAll(/REFERENCES `([^`]+)`/g)) selected.add(match[1]);
      }
    }
    for (const statement of statements) {
      const table = statement.match(/(?:CREATE TABLE|ALTER TABLE) `([^`]+)`/) ?? statement.match(/CREATE (?:UNIQUE )?INDEX .+ ON `([^`]+)`/);
      if (table && selected.has(table[1])) await db.$executeRawUnsafe(statement);
    }
    console.log(`Prepared ${selected.size} real tables with their foreign-key dependencies.`);
    await db.tbl_branches.createMany({data:[{branch_id:1,branch_name:'Test branch A',from_id:0},{branch_id:2,branch_name:'Test branch B',from_id:0}]});
    for (const name of ['20261015_flat_warehouse_drawings', '20261015_supplier_return_integration']) {
      const sql=readFileSync(resolve('prisma/migrations',name,'migration.sql'),'utf8');
      for(const statement of sql.split(';').map((s)=>s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    }
    assert.equal(await db.tbl_branches.count(),2); passed('additive migrations preserve existing rows');
    const prisma=db as never;
    const scope=new BranchScopeService();const location=new InventoryLocationService(prisma);const stock=new InventoryStockService(prisma);
    const ledger=new LedgerService(prisma);const moduleLedger=new ModuleLedgerService(ledger,new AccountsService(prisma));
    await moduleLedger.ensureChart();
    const warehouses=new WarehousesService(prisma,scope);
    const invoices=new SupplierInvoicesService(prisma,stock,location,moduleLedger,ledger,scope);
    const payments=new SupplierPaymentsService(prisma,moduleLedger,scope);
    const returns=new PurchaseReturnsService(prisma,stock,ledger);
    const transactions=new InventoryTransactionsService(prisma,stock,location,moduleLedger,scope);
    const adminUser={sub:1,level:1,branch:1} as never;
    const branchUser={sub:2,level:2,branch:1} as never;
    const store=await warehouses.create({nameAr:'Test stock',address:'Test address',branchId:1},adminUser);
    const bar=await warehouses.create({nameAr:'Test bar',address:'Counter',branchId:1},adminUser);
    const other=await warehouses.create({nameAr:'Other branch',address:'Other',branchId:2},adminUser);
    await assert.rejects(()=>warehouses.findOne(other.id,branchUser));passed('flat warehouses enforce branch access');
    const category=await db.inv_categories.create({data:{name_ar:'بار',name_en:'Bar'}});
    const supplier=await db.inv_suppliers.create({data:{name_ar:'Synthetic supplier',name_en:'Synthetic supplier'}});
    const product=await db.inv_products.create({data:{product_code:'TEST-WATER',name_ar:'Test water',selling_price:10,cost_price:5,unit_of_measure:'piece',inventory_kind:'ready_product',inventory_section:'ready_products',category_id:category.id}});
    await db.inv_supplier_products.create({data:{supplier_id:supplier.id,product_id:product.id}});
    const cafe=await db.cafe_products.create({data:{product_code:'TEST-CAFE',name:'Test water',sell_price:10,product_type:'ready',category_id:category.id,inventory_product_id:product.id}});
    const day=localDateString(new Date());
    const invoice=await invoices.create({supplierId:supplier.id,branchId:1,warehouseId:store.id,invoiceDate:day,paidAmount:200,initialPaymentMethod:'cash',items:[{productId:product.id,productName:'Test water',quantity:100,unit:'piece',lineTotal:500,unitPrice:5,costUpdateMode:'keep'}]},adminUser);
    const quantity=async(id:number)=>Number((await db!.inv_stock_balances.findUnique({where:{product_id_warehouse_id:{product_id:product.id,warehouse_id:id}}}))?.current_stock??0);
    assert.equal(await quantity(store.id),100);assert.equal(invoice.remainingAmount,300);passed('purchase posts selected stock, payment and supplier debt');
    await assert.rejects(()=>warehouses.remove(store.id,adminUser));passed('warehouse with stock cannot be deleted');
    const transfer=await transactions.create({reference:'TEST-TRANSFER',txnType:'transfer',txnDate:day,branchId:1,sourceWarehouseId:store.id,targetWarehouseId:bar.id,items:[{productId:product.id,itemName:'Test water',quantity:20,price:999}]},adminUser);
    await transactions.approve(transfer.id,adminUser);
    assert.equal(await quantity(store.id),80);assert.equal(await quantity(bar.id),20);passed('transfer preserves stock and resolves cost on server');
    const shift=await db.sales_shifts.create({data:{shift_name:'Test shift',start_time:'00:00',end_time:'23:59',branch_id:1}});
    await db.sales_shift_sessions.create({data:{shift_id:shift.id,branch_id:1,user_id:1,session_date:day,expected_start_time:'00:00',expected_end_time:'23:59'}});
    const sessions=new ShiftSessionsService(prisma,{} as never,{} as never,{} as never,moduleLedger);
    const sales=new QuickSalesService(prisma,stock,location,sessions,moduleLedger,{getNumericSetting:async()=>0,isTaxEnabled:async()=>false,getTaxRate:async()=>0} as never,scope,{canAny:async()=>true} as never);
    const sale=await sales.create({branchId:1,warehouseId:bar.id,gender:'male',cafeCategoryId:category.id,paymentMethod:'cash',items:[{cafeProductId:cafe.id,name:'Test water',quantity:3}]},1,adminUser);
    assert.equal(sale.totalAmount,30);assert.equal(await quantity(bar.id),17);passed('actual POS sale deducts selected bar and posts collection');
    const draw=await transactions.createDrawing({reference:'TEST-DRAW',txnType:'issue',txnDate:day,branchId:1,sourceWarehouseId:bar.id,recipientName:'Synthetic recipient',reason:'Administrative use',gender:'male',cafeCategoryId:category.id,items:[{productId:product.id,itemName:'Test water',quantity:2,price:999}]},adminUser);
    assert('status' in draw);assert.equal(draw.status,'approved');assert.equal(draw.totalAmount,10);assert.equal(await quantity(bar.id),15);assert.equal(await db.sales_quick_sales.count(),1);passed('drawing is immediate, at cost, without a sale or personal debt');
    await assert.rejects(()=>transactions.createDrawing({reference:'TEST-DRAW-FAIL',txnType:'issue',txnDate:day,branchId:1,sourceWarehouseId:bar.id,recipientName:'Synthetic recipient',reason:'Insufficient',gender:'male',cafeCategoryId:category.id,items:[{productId:product.id,itemName:'Test water',quantity:500}]},adminUser));
    assert.equal(await db.inv_transactions.count({where:{reference:'TEST-DRAW-FAIL'}}),0);assert.equal(await quantity(bar.id),15);passed('failed drawing rolls back document, stock and accounting');
    const cross=await transactions.create({reference:'TEST-CROSS',txnType:'transfer',txnDate:day,branchId:1,sourceWarehouseId:bar.id,targetWarehouseId:other.id,items:[{productId:product.id,itemName:'Test water',quantity:5}]},adminUser);
    await transactions.approve(cross.id,adminUser);
    assert.equal(Number((await db.inv_product_branches.findUniqueOrThrow({where:{product_id_branch_id:{product_id:product.id,branch_id:1}}})).stock_quantity),90);
    assert.equal(Number((await db.inv_product_branches.findUniqueOrThrow({where:{product_id_branch_id:{product_id:product.id,branch_id:2}}})).stock_quantity),5);passed('cross-branch transfer updates each branch mirror');
    const returnDto={supplierId:supplier.id,supplierInvoiceId:invoice.id,warehouseId:store.id,branchId:1,items:[{productId:product.id,productName:'Untrusted name',quantity:10,unitPrice:999}]};
    const ret=await returns.create(returnDto,1,adminUser);assert.equal(ret.totalAmount,50);await returns.changeStatus(ret.id,{status:'معتمد'},1);
    assert.equal(Number((await db.prc_supplier_invoices.findUniqueOrThrow({where:{id:invoice.id}})).remaining_amount),250);passed('linked return uses invoice price and reduces supplier liability');
    await payments.settleDebt({supplierId:supplier.id,branchId:1,paymentAmount:250,paymentDate:day,paymentMethod:'cash'},1,adminUser);
    const ret2=await returns.create(returnDto,1,adminUser);await returns.changeStatus(ret2.id,{status:'معتمد'},1);
    assert.equal(Number((await db.prc_supplier_invoices.findUniqueOrThrow({where:{id:invoice.id}})).remaining_amount),-50);
    await payments.receiveRefund({supplierId:supplier.id,branchId:1,paymentAmount:50,paymentDate:day,paymentMethod:'cash'},adminUser);
    assert.equal(Number((await db.prc_supplier_invoices.findUniqueOrThrow({where:{id:invoice.id}})).remaining_amount),0);passed('paid return creates credit and cash refund clears it');
    await invoices.createOpening({supplierId:supplier.id,branchId:1,amount:100,date:day},adminUser);
    await assert.rejects(()=>invoices.createOpening({supplierId:supplier.id,branchId:1,amount:100,date:day},adminUser));
    await payments.settleDebt({supplierId:supplier.id,branchId:1,paymentAmount:100,paymentDate:day,paymentMethod:'cash'},1,adminUser);
    assert.equal((await invoices.statement(supplier.id,1,adminUser)).balance,0);passed('opening supplier balance is unique, payable and reconciles in statement');
    const counts=new StockTakingService(prisma,stock,location,moduleLedger);const session=await counts.createSession({warehouseId:store.id},adminUser);
    await counts.addCountItem(session.id,{productId:product.id,itemName:'Test water',countedQuantity:59});const adj=await counts.finalizeSession(session.id,1);await counts.approveAdjustment(adj.adjustmentId,1,false,adminUser);
    assert.equal(await quantity(store.id),59);assert.equal(Number((await db.inv_product_branches.findUniqueOrThrow({where:{product_id_branch_id:{product_id:product.id,branch_id:1}}})).stock_quantity),69);passed('counting one warehouse preserves other locations in branch');
    const nextCount=await counts.createSession({warehouseId:store.id},adminUser);
    assert.notEqual(nextCount.sessionNumber,session.sessionNumber);passed('a later count receives a new number with real MySQL bigint results');
    const report=await new InventoryMovementsService(prisma,scope).balancesReport({dateFrom:day,dateTo:day} as never,adminUser);
    assert.equal(report.reduce((s,r)=>s+r.closing,0),74);passed('stock report reconciles purchases, sales, drawings, transfers, returns and count');
    const entries=await db.acc_journal_entries.findMany({where:{status:'posted'},include:{lines:true}});
    for(const e of entries) assert.equal(e.lines.reduce((s,l)=>s+Number(l.debit)-Number(l.credit),0),0);
    assert.equal(entries.filter((e)=>e.source_doc_type==='quick_sale').length,1);passed('all journal entries balance; drawings create no sales revenue');
    mkdirSync(resolve('../output'),{recursive:true});writeFileSync(resolve('../output/cafe-integration-validation.json'),JSON.stringify({passed:checks.length,checks,at:new Date().toISOString(),isolatedDatabase:true},null,2));
    console.log(`Completed ${checks.length} real-database integration checks.`);
  } catch (error) {
    console.error(`Integration failure: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    if(db)await db.$disconnect();
    if(created && /^codex_cafe_test_[a-f0-9]{12}$/.test(dbName)) await admin.$executeRawUnsafe(`DROP DATABASE \`${dbName}\``);
    await admin.$disconnect();
    try{unlinkSync(baselinePath);}catch{}
  }
}
main().catch((e)=>{console.error(e.message);process.exitCode=1;});
