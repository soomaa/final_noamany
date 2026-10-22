import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export interface CountItem {
  id: number;
  productId: number | null;
  itemName: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  notes?: string | null;
}

export interface CountSession {
  id: number;
  sessionNumber: string;
  warehouseId: number;
  warehouseName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  branchId?: number | null;
  status: string;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
  items: CountItem[];
  adjustmentId?: number | null;
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  awaiting_approval: 'بانتظار الاعتماد',
  completed: 'معتمد',
  approved: 'معتمد',
};
/** Legacy imported counts use `approved`; both mean the stock was already updated. */
export const isApproved = (status: string) => status === 'completed' || status === 'approved';

export const surplus = (variance: number) => (variance > 0 ? variance : 0);
export const shortage = (variance: number) => (variance < 0 ? -variance : 0);

/** Read-only view of one stock-count report ("محضر الجرد") with all its items. */
export function StockCountDetailsDialog({ session, onClose }: { session: CountSession | null; onClose: () => void }) {
  const { ui } = useLocale();
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ui('تفاصيل محضر الجرد')}</DialogTitle>
        </DialogHeader>
        {session && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 overflow-hidden rounded-md border text-sm md:grid-cols-4">
              {[
                ['رقم محضر الجرد', session.sessionNumber],
                ['التاريخ', session.createdAt.slice(0, 10)],
                ['المخزن', session.warehouseName],
                ['النوع', session.categoryName],
                ['اسم الموظف', session.createdByName],
                ['الحالة', ui(STATUS_LABELS[session.status] ?? session.status)],
                ['ملاحظات', session.notes],
                ['عدد الأصناف', toArabicDigits(session.items.length)],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <div className="border-b bg-muted/60 px-3 py-2 font-semibold">{ui(label as string)}</div>
                  <div className="border-b px-3 py-2">{value || '—'}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-center">
                    <th className="p-2">{ui('م')}</th>
                    <th className="p-2 text-start">{ui('اسم الصنف')}</th>
                    <th className="p-2">{ui('الكمية المتاحة')}</th>
                    <th className="p-2">{ui('الكمية')}</th>
                    <th className="p-2">{ui('الزيادة')}</th>
                    <th className="p-2">{ui('العجز')}</th>
                    <th className="p-2">{ui('ملاحظات')}</th>
                  </tr>
                </thead>
                <tbody>
                  {session.items.map((i, idx) => (
                    <tr key={i.id} className="border-t text-center even:bg-muted/30">
                      <td className="p-2 nums">{toArabicDigits(idx + 1)}</td>
                      <td className="p-2 text-start">{i.itemName}</td>
                      <td className="p-2 nums">{toArabicDigits(i.systemQuantity)}</td>
                      <td className="p-2 nums">{toArabicDigits(i.countedQuantity)}</td>
                      <td className="p-2 nums text-success">{toArabicDigits(surplus(i.variance))}</td>
                      <td className="p-2 nums text-destructive">{toArabicDigits(shortage(i.variance))}</td>
                      <td className="p-2">{i.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
