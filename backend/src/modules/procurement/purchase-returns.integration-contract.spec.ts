import { PurchaseReturnsService } from './purchase-returns.service';

describe('purchase return original-invoice contract', () => {
  function fixture(quantity = 100, amount = 500) {
    // Like the database, the created row carries created_at (@default(now())).
    const create = jest.fn().mockImplementation(({data}) => ({id:1,created_at:new Date('2026-10-21T10:00:00Z'),...data,items:data.items.create}));
    const tx={prc_purchase_returns:{create},$queryRaw:jest.fn().mockResolvedValue([{maxNum:0}])};
    const prisma={prc_supplier_invoices:{findFirst:jest.fn().mockResolvedValue({id:8,supplier_id:3,branch_id:4,warehouse_id:5,is_opening_balance:false,subtotal:amount,total_amount:amount,items:[{product_id:7,product_name:'Water',quantity,base_quantity:quantity,total_amount:amount}]})},$transaction:jest.fn(async(fn)=>fn(tx))};
    return {service:new PurchaseReturnsService(prisma as never,{} as never,{} as never),prisma,create};
  }
  const input={supplierInvoiceId:8,supplierId:3,branchId:4,warehouseId:5,items:[{productId:7,productName:'Forged',quantity:10,unitPrice:999,total:9999}]};
  it('resolves the product name and value from the purchased units',async()=>{
    const {service,create}=fixture();
    const result=await service.create(input,1,{sub:1,level:1} as never);
    expect(result.totalAmount).toBe(50);
    expect(create.mock.calls[0][0].data.items.create[0]).toMatchObject({product_name:'Water',unit_price:5,total:50});
  });
  it('preserves a complete invoice total when unit price has rounding fractions',async()=>{
    const {service}=fixture(3,100);
    const result=await service.create({...input,items:[{...input.items[0],quantity:3}]},1);
    expect(result.totalAmount).toBe(100);
  });
  it('rejects excessive return quantities before creating a document',async()=>{
    const {service,prisma}=fixture();
    await expect(service.create({...input,items:[{...input.items[0],quantity:101}]},1)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a forged invoice location and a foreign user branch',async()=>{
    const {service,prisma}=fixture();
    await expect(service.create({...input,warehouseId:99},1)).rejects.toThrow();
    await expect(service.create(input,1,{sub:1,branch:9,level:2} as never)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('does not allow clients to create approved returns without stock posting',async()=>{
    const {service}=fixture();
    await expect(service.create({...input,status:'معتمد'},1)).rejects.toThrow();
  });
});
