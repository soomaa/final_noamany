import {stockSummary, SummaryMovement} from './stock-summary.util';
describe('warehouse period reconciliation',()=>{
  it('separates sales, drawings and transfers and excludes later movements',()=>{
    const from=new Date('2026-10-01');const end=new Date('2026-11-01');
    const m=(quantity:number,direction:string,txnType:string,docType:string,drawing=false,date=new Date('2026-10-15')):SummaryMovement=>({quantity,direction,txnType,docType,drawing,date});
    const result=stockSummary(22,[m(20,'in','transfer','transfer'),m(-3,'out','issue','cafe_sale'),m(-2,'out','issue','inventory_transaction',true),m(7,'in','receipt','supplier_invoice',false,new Date('2026-11-02'))],from,end);
    expect(result).toMatchObject({opening:0,transfersIn:20,sales:3,drawings:2,closing:15,purchases:0});
    expect(result.opening+result.transfersIn-result.sales-result.drawings).toBe(result.closing);
  });
});
