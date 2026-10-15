import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { DebitNoteRow } from '@/types/gym-sales';
import type { NamedEntity } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { Link } from 'react-router-dom';
import { GYM_SALES_ROUTES } from '@/lib/gym-sales-routes';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';
import type { PurchaseReturnRow } from '@/types/gym-sales';
import { uiStatic } from '@/lib/ui-static';

function ReturnsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<PurchaseReturnRow>('purchase-returns', params);

  const columns = useMemo<ColumnDef<PurchaseReturnRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<PurchaseReturnRow>,
      { accessorKey: 'returnNumber', header: uiStatic('رقم المرتجع') },
      {
        accessorKey: 'totalAmount',
        header: uiStatic('القيمة'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      { accessorKey: 'status', header: uiStatic('الحالة') },
    ],
    [params.page, params.pageSize, ui],
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" asChild>
          <Link to={GYM_SALES_ROUTES.procurement.returns}>{uiStatic('إدارة المرتجعات الكاملة')}</Link>
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </>
  );
}

function DebitNotesTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = usePaginatedList<DebitNoteRow>('debit-notes', params);

  const { data: stats } = useQuery({
    queryKey: ['debit-notes', 'stats'],
    queryFn: async () => {
      const { data: s } = await api.get<{ total: number; totalAmount: number }>('/debit-notes/stats');
      return s;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<NamedEntity>>('/suppliers', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [debitAmount, setDebitAmount] = useState('');
  const [branchId, setBranchId] = useState('');
  const [saving, setSaving] = useState(false);

  const columns = useMemo<ColumnDef<DebitNoteRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<DebitNoteRow>,
      { accessorKey: 'debitNumber', header: uiStatic('رقم الإشعار') },
      { accessorKey: 'supplierId', header: uiStatic('المورد') },
      { accessorKey: 'reason', header: uiStatic('السبب') },
      {
        accessorKey: 'debitAmount',
        header: uiStatic('المبلغ'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      { accessorKey: 'status', header: uiStatic('الحالة') },
    ],
    [params.page, params.pageSize, ui],
  );

  const save = async () => {
    if (!supplierId || !reason || !branchId) {
      toast.error(uiStatic('يرجى تعبئة الحقول المطلوبة'));
      return;
    }
    const amount = Number(debitAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(uiStatic('المبلغ يجب أن يكون أكبر من صفر'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/debit-notes', {
        supplierId: Number(supplierId),
        reason,
        debitAmount: amount,
        branchId: Number(branchId),
      });
      toast.success(uiStatic('تم إنشاء الإشعار المدين'));
      setOpen(false);
      // Invalidate the whole ['debit-notes'] prefix so the list AND the stats query refetch.
      void queryClient.invalidateQueries({ queryKey: ['debit-notes'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>
            {uiStatic('الإجمالي')}: <span className="nums font-medium text-foreground">{toArabicDigits(stats?.total ?? 0)}</span>
          </span>
          <span>
            {uiStatic('القيمة')}: <span className="nums font-medium text-foreground">{toArabicDigits(stats?.totalAmount ?? 0)}</span>
          </span>
        </div>
        <Button
          onClick={() => {
            setSupplierId('');
            setReason('');
            setDebitAmount('');
            setBranchId(String(branches?.[0]?.id ?? ''));
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {uiStatic('إشعار جديد')}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{uiStatic('إشعار مدين جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>{uiStatic('المورد')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">{uiStatic('—')}</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('السبب')}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{uiStatic('المبلغ')}</Label>
                <Input
                  type="number"
                  className="nums"
                  value={debitAmount}
                  onChange={(e) => setDebitAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('الفرع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {(branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {uiStatic('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {uiStatic('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProcurementReturnsDebitPage() {
  const { ui } = useLocale();
  const [tab, setTab] = useState<'returns' | 'debit'>('returns');

  return (
    <GymSalesPageShell
      section="procurement"
      title={ui('المرتجعات والإشعارات المدينة')}
      description={ui('مرتجعات المشتريات وإشعارات الخصم للموردين')}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'returns' | 'debit')} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="returns">{ui('مرتجع المشتريات')}</TabsTrigger>
          <TabsTrigger value="debit">{ui('الإشعارات المدينة')}</TabsTrigger>
        </TabsList>
        <TabsContent value="returns">
          <ReturnsTab />
        </TabsContent>
        <TabsContent value="debit">
          <DebitNotesTab />
        </TabsContent>
      </Tabs>
    </GymSalesPageShell>
  );
}
