export type SummaryMovement = { quantity:number; direction:string; date:Date; txnType:string; docType:string|null; drawing?:boolean };
export function stockSummary(current:number, movements:SummaryMovement[], from:Date, endExclusive:Date) {
  const row={opening:current,purchases:0,sales:0,drawings:0,transfersIn:0,transfersOut:0,purchaseReturns:0,salesReturns:0,adjustments:0,closing:current};
  for (const m of movements) {
    const signed=Math.abs(m.quantity)*(m.direction==='in'?1:-1);
    if (m.date>=from) row.opening-=signed;
    if (m.date>=endExclusive) row.closing-=signed;
    if (m.date<from || m.date>=endExclusive) continue;
    if (m.drawing) row.drawings-=signed;
    else if (m.txnType==='transfer') {if (signed>0) row.transfersIn+=signed; else row.transfersOut-=signed;}
    else if (m.txnType==='purchase_return') row.purchaseReturns-=signed;
    else if (m.txnType==='sales_return') row.salesReturns+=signed;
    else if (['cafe_sale','sale','cafe_draft','cafe_draft_adjustment','cafe_draft_cancel'].includes(m.docType ?? '')) row.sales-=signed;
    else if (['supplier_invoice','supplier_invoice_correction','goods_receipt'].includes(m.docType ?? '') || m.txnType==='receipt') row.purchases+=signed;
    else row.adjustments+=signed;
  }
  return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Math.round(value*1000)/1000])) as typeof row;
}
