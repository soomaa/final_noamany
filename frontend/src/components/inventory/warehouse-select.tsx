import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/store/locale';
import type { PaginatedResponse } from '@/components/common/data-table';

export interface StockLocation { id: number; nameAr: string; address?: string | null; branchId: number }

export function WarehouseSelect({ branchId, value, onChange, label = 'المخزن / مكان البضاعة', disabled = false, emptyLabel = 'مخزون الفرع الحالي (افتراضي)' }: {
  branchId?: number | string; value: string; onChange: (id: string) => void; label?: string; disabled?: boolean; emptyLabel?: string;
}) {
  const { ui } = useLocale();
  const { data = [], isError } = useQuery({
    queryKey: ['warehouses', 'selection', branchId],
    queryFn: async () => (await api.get<PaginatedResponse<StockLocation>>('/warehouses', {
      params: { page: 1, pageSize: 200, status: 'active', branchId: branchId || undefined },
    })).data.data,
  });
  return <div className="space-y-1.5"><Label>{ui(label)}</Label>
    <select aria-label={ui(label)} disabled={disabled || isError} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
      <option value="">{ui(isError ? 'تعذر تحميل المخازن' : emptyLabel)}</option>
      {data.map((w) => <option key={w.id} value={w.id}>{w.nameAr}{w.address ? ` — ${w.address}` : ''}</option>)}
    </select>
  </div>;
}
