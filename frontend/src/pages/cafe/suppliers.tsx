import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Phone, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/components/common/data-table';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '@/pages/gym-sales/shell';
import { usePermission } from '@/hooks/use-permission';
import { SupplierAccount } from '@/components/inventory/supplier-account';
import { SupplierFormDialog, type Supplier } from '@/components/procurement/supplier-form-dialog';

export function CafeSuppliersPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'cafe-management'],
    queryFn: async () => (await api.get<PaginatedResponse<Supplier>>('/suppliers', { params: { page: 1, pageSize: 200 } })).data.data,
  });

  return (
    <GymSalesPageShell section="procurement" title={ui('موردو الكافيه')} description={ui('بيانات المورد وأرقام التواصل والخامات التي يوفرها')}>
      <div className="mb-4 flex justify-end">
        {can('gym-sales.procurement.suppliers:create') ? <Button onClick={() => { setEditId(null); setOpen(true); }}><Plus className="size-4" />{ui('مورد جديد')}</Button> : null}
      </div>
      {(suppliers ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{ui('لا يوجد موردون بعد. أضف المورد ثم اربطه بالخامات التي يوفرها.')}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(suppliers ?? []).map((supplier) => (
            <Card key={supplier.id} className="overflow-hidden transition-shadow hover:shadow-md">
              <CardHeader className="flex-row items-center justify-between border-b bg-muted/30">
                <CardTitle className="text-base">{supplier.nameAr}</CardTitle>
                {can('gym-sales.procurement.suppliers:update') ? <Button aria-label={ui('تعديل المورد')} variant="ghost" size="icon" onClick={() => { setEditId(supplier.id); setOpen(true); }}><Pencil className="size-4" /></Button> : null}
              </CardHeader>
              <CardContent className="space-y-3 pt-4 text-sm">
                <div className="space-y-1.5">
                  {(supplier.phones ?? []).length ? supplier.phones.map((phone) => (
                    <div key={phone.id ?? phone.phone} className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5" />
                      <span dir="ltr" className="nums">{phone.phone}</span>
                      {phone.isPrimary && <Badge variant="secondary" className="text-[10px]">{ui('أساسي')}</Badge>}
                    </div>
                  )) : <span className="text-muted-foreground">—</span>}
                </div>
                <p className="text-muted-foreground">{supplier.address || '—'}</p>
                <SupplierAccount supplierId={supplier.id} name={supplier.nameAr} />
                <div className="flex items-center justify-between"><span>{ui('التقييم')}: {supplier.rating ?? '—'}</span><Badge variant={supplier.isActive ? 'default' : 'outline'}>{supplier.isActive ? ui('نشط') : ui('غير نشط')}</Badge></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SupplierFormDialog open={open} onOpenChange={setOpen} supplierId={editId} />
    </GymSalesPageShell>
  );
}
