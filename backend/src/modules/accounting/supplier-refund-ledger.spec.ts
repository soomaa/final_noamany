import {ModuleLedgerService} from './module-ledger.service';
describe('supplier refund accounting',()=>{
  it('increases cash and clears the supplier credit without recording sales',async()=>{
    const postEntry=jest.fn();
    const service=new ModuleLedgerService({postEntry} as never,{ensureSeeded:jest.fn()} as never);
    await service.postSupplierPayment({paymentNumber:'REF-1',paymentDate:'2026-10-15',amount:50,paymentMethod:'cash',createdBy:1,isRefund:true});
    expect(postEntry.mock.calls[0][0]).toMatchObject({sourceDocType:'supplier_refund',lines:[{accountCode:'accounts_payable',debit:0,credit:50},{accountCode:'cash',debit:50,credit:0}]});
  });
});
