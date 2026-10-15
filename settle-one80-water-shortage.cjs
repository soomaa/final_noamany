'use strict';
const REF = 'ONE80-WATER-SHORTAGE-77-58-20260909';
function plan(balances) {
  return [[36,58],[38,77]].map(([id,quantity]) => {
    const matches=balances.filter(b=>b.product_id===id);
    if(matches.length!==1) throw Error('Missing/duplicate balance '+id);
    const before=Number(matches[0].current_stock);
    if(!Number.isFinite(before)||before<quantity) throw Error('Insufficient stock '+id);
    return {id,quantity,before,after:before-quantity};
  });
}
module.exports={plan};
async function main() {
  const fs=require('node:fs');
  const {createRequire}=require('node:module');
  const app='/home/alatheertech/one80.alatheertech.com';
  const req=createRequire(app+'/package.json');
  req('dotenv').config({path:app+'/.env',quiet:true});
  const {PrismaClient}=req('@prisma/client');
  const {InventoryStockService}=req(app+'/dist/modules/inventory/inventory-stock.service.js');
  const {LedgerService}=req(app+'/dist/modules/accounting/ledger.service.js');
  const p=new PrismaClient();
  const stock=new InventoryStockService(p), ledger=new LedgerService(p);
  try {
    const result=await p.$transaction(async tx=>{
      // Serialize this correction with sales touching either balance.
      await tx.$queryRawUnsafe('SELECT id FROM inv_stock_balances WHERE warehouse_id=1 AND product_id IN (36,38) ORDER BY product_id FOR UPDATE');
      const existing=await tx.inv_count_sessions.findUnique({where:{session_number:REF}});
      if(existing) return {status:'ALREADY_RECORDED_NO_DEDUCTION',reference:REF,statusRecorded:existing.status};
      const duplicate=await tx.inv_movements.findFirst({where:{doc_ref:REF}});
      if(duplicate) throw Error('Existing movement without session; manual review required');
      const priorJournal=await tx.acc_journal_entries.findFirst({where:{source_module:'inventory',source_doc_type:'stock_count_adjustment',source_doc_id:REF}});
      if(priorJournal) throw Error('Existing accounting entry; manual review required');
      const warehouse=await tx.inv_warehouses.findFirst({where:{id:1,branch_id:1,is_deleted:false}});
      if(!warehouse) throw Error('Warehouse identity mismatch');
      const products=await tx.inv_products.findMany({where:{id:{in:[36,38]}}});
      for(const [id,code] of [[36,'PRD000001'],[38,'PRD000002']]) {
        const product=products.find(x=>x.id===id);
        if(!product||product.product_code!==code||product.is_deleted) throw Error('Product identity mismatch '+id);
        if(!(Number(product.cost_price)>0)) throw Error('Missing positive inventory cost '+id);
      }
      const balances=await tx.inv_stock_balances.findMany({where:{warehouse_id:1,product_id:{in:[36,38]}}});
      const rows=plan(balances);
      const mirrors=await tx.inv_product_branches.findMany({where:{branch_id:1,product_id:{in:[36,38]}}});
      for(const row of rows) {
        const mirror=mirrors.find(x=>x.product_id===row.id);
        if(!mirror||Number(mirror.stock_quantity)!==row.before) throw Error('Branch/warehouse balance mismatch '+row.id);
      }
      if(process.argv[2]!=='--apply') return {status:'PREVIEW_ONLY',rows};
      fs.mkdirSync(app+'/backups',{recursive:true});
      const dir=fs.mkdtempSync(app+'/backups/water-shortage-77-58-');
      fs.chmodSync(dir,0o700);
      const backup=dir+'/before.json';
      fs.writeFileSync(backup,JSON.stringify({reference:REF,createdAt:new Date(),products,balances,mirrors,rows},null,2),{flag:'wx',mode:0o600});
      const notes='تسوية عجز فعلي معتمدة من مالكة النظام عبر SSH: 77 مياه صغيرة و58 كبيرة فقط؛ دون تعديل الجرد القديم أو المبيعات';
      const session=await tx.inv_count_sessions.create({data:{session_number:REF,warehouse_id:1,branch_id:1,status:'completed',notes,items:{create:rows.map(row=>({product_id:row.id,item_code:products.find(x=>x.id===row.id).product_code,item_name:products.find(x=>x.id===row.id).name_ar,system_quantity:row.before,counted_quantity:row.after,variance:-row.quantity,variance_reason:notes}))}}});
      await tx.inv_adjustments.create({data:{adjustment_number:REF,session_id:session.id,warehouse_id:1,status:'approved',approved_at:new Date(),approved_by:'SSH: owner-authorized',notes}});
      let loss=0;
      for(const row of rows) {
        const cost=Number(products.find(x=>x.id===row.id).cost_price);
        loss+=cost*row.quantity;
        await stock.applyMovement({productId:row.id,warehouseId:1,branchId:1,direction:'out',quantity:row.quantity,txnType:'count',docType:'stock_taking',docRef:REF,unitCost:cost,allowNegative:false},tx);
      }
      loss=Math.round((loss+Number.EPSILON)*100)/100;
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      await ledger.postEntry({sourceModule:'inventory',sourceDocType:'stock_count_adjustment',sourceDocId:REF,branchId:1,date,description:notes,lines:[{accountCode:'operating_expense',debit:loss,credit:0},{accountCode:'inventory',debit:0,credit:loss}],entryPrefix:'A'},tx);
      const after=await tx.inv_stock_balances.findMany({where:{warehouse_id:1,product_id:{in:[36,38]}}});
      const moves=await tx.inv_movements.findMany({where:{doc_ref:REF}});
      if(moves.length!==2) throw Error('Unexpected movement count');
      for(const row of rows) {
        const m=moves.find(x=>x.product_id===row.id);
        if(Number(after.find(x=>x.product_id===row.id)?.current_stock)!==row.after||!m||Number(m.quantity)!==-row.quantity||Number(m.balance_after)!==row.after) throw Error('Verification failed; rolling back');
      }
      return {status:'APPLIED_AND_VERIFIED',reference:REF,backup,rows};
    },{timeout:30000,maxWait:10000,isolationLevel:'Serializable'});
    console.log(JSON.stringify(result,null,2));
  } finally {await p.$disconnect();}
}
if(require.main===module) main().catch(e=>{console.error('STOPPED:',e.message);process.exitCode=1;});
