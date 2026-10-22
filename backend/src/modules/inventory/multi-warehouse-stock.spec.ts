import { InventoryStockService } from './inventory-stock.service';

describe('multi-warehouse stock movements',()=>{
  it('records each transfer side under the owning branch',async()=>{
    const service=new InventoryStockService({} as never);
    const movement=jest.spyOn(service,'applyMovement').mockResolvedValue({} as never);
    const tx={inv_transactions:{findFirst:jest.fn().mockResolvedValue({id:1,items:[]})},inv_warehouses:{findMany:jest.fn().mockResolvedValue([{id:10,branch_id:4},{id:20,branch_id:9}])}};
    await service.applyTransaction({transactionId:1,txnType:'transfer',branchId:4,sourceWarehouseId:10,targetWarehouseId:20,lines:[{productId:7,quantity:5,unitCost:3}]},tx as never);
    expect(movement.mock.calls[0][0]).toMatchObject({warehouseId:10,branchId:4,direction:'out',quantity:5,unitCost:3});
    expect(movement.mock.calls[1][0]).toMatchObject({warehouseId:20,branchId:9,direction:'in',quantity:5,unitCost:3});
  });
  it('counts one warehouse using its delta instead of overwriting the whole branch balance',async()=>{
    const branch=jest.fn();
    const tx={inv_products:{findUnique:jest.fn().mockResolvedValue({min_stock:0,max_stock:100,reorder_point:1})},inv_stock_balances:{upsert:jest.fn().mockResolvedValue({id:1,current_stock:5}),update:jest.fn().mockResolvedValue({id:1,current_stock:3})},inv_movements:{create:jest.fn()},inv_product_branches:{upsert:branch}};
    await new InventoryStockService({} as never).applyMovement({productId:7,warehouseId:10,branchId:4,txnType:'count',direction:'in',quantity:3,operation:'set',docType:'stock_taking'},tx as never);
    expect(branch).toHaveBeenCalledWith(expect.objectContaining({update:{stock_quantity:{increment:-2}}}));
  });
});
