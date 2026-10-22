import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { downloadExcel } from '@/lib/export';
import { localToday } from '@/lib/formatters';
import { InventoryPageShell } from './inventory-shell';

/** Approved warehouse transfers, shown as issue orders to the receiving branch. */
type BranchIssueItem = { id: number; productId: number | null; itemCode: string | null; itemName: string; quantity: number; unit: string | null; price: number; total: number };
type BranchIssue = {
  id: number;
  reference: string;
  txnDate: string;
  notes: string | null;
  totalAmount: number;
  totalQuantity: number;
  sourceWarehouseName: string | null;
  sourceBranchId: number | null;
  targetWarehouseName: string | null;
  targetBranchId: number | null;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  items: BranchIssueItem[];
};
type BranchIssueResult = { data: BranchIssue[]; total: number; page: number; pageSize: number };
type Filters = { targetBranchId: string; dateFrom: string; dateTo: string };

const money = (value: number) => value.toFixed(2);
const day = (value: string) => value.slice(0, 10);

function useBranchIssues(filters: Filters, search: string, page: number, pageSize: number) {
  const params = { ...filters, search, page, pageSize };
  return useQuery({
    queryKey: ['inventory-transactions', 'branch-issues', params],
    queryFn: async () => (await api.get<BranchIssueResult>('/inventory-transactions/branch-issues', { params })).data,
  });
}

function useBranchName() {
  const { data: branches = [] } = useBranches();
  return {
    branches,
    branchName: (id: number | null) => (id == null ? '—' : branches.find((b) => b.id === id)?.name ?? `#${id}`),
  };
}

function IssueDetailsDialog({ issue, onClose, branchName }: { issue: BranchIssue | null; onClose: () => void; branchName: (id: number | null) => string }) {
  return (
    <Dialog open={issue !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>تفاصيل أمر الصرف رقم {issue?.id}</DialogTitle></DialogHeader>
        {issue && (
          <div className="space-y-4 py-2">
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="رقم الصرف" value={String(issue.id)} />
              <Detail label="المرجع" value={issue.reference} />
              <Detail label="تاريخ الصرف" value={day(issue.txnDate)} />
              <Detail label="من مخزن" value={`${issue.sourceWarehouseName ?? '—'} (${branchName(issue.sourceBranchId)})`} />
              <Detail label="الفرع المصروف إليه" value={branchName(issue.targetBranchId)} />
              <Detail label="مخزن الفرع المستلم" value={issue.targetWarehouseName ?? '—'} />
              <Detail label="أنشأه" value={issue.createdByName ?? '—'} />
              <Detail label="اعتمده" value={issue.approvedByName ?? '—'} />
              <Detail label="ملاحظات" value={issue.notes || '—'} />
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>م</TableHead><TableHead>الصنف</TableHead><TableHead>الكود</TableHead><TableHead>الوحدة</TableHead><TableHead>الكمية</TableHead><TableHead>سعر التكلفة</TableHead><TableHead>الإجمالي</TableHead></TableRow></TableHeader>
              <TableBody>
                {issue.items.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{item.itemName}</TableCell>
                    <TableCell className="font-mono">{item.itemCode ?? '—'}</TableCell>
                    <TableCell>{item.unit ?? '—'}</TableCell>
                    <TableCell className="nums">{item.quantity}</TableCell>
                    <TableCell className="nums">{money(item.price)}</TableCell>
                    <TableCell className="nums">{money(item.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell colSpan={4}>الإجمالي</TableCell>
                  <TableCell className="nums">{issue.totalQuantity}</TableCell>
                  <TableCell />
                  <TableCell className="nums">{money(issue.totalAmount)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}

/** أوامر الصرف للأفرع */
export function InventoryBranchIssueOrdersPage() {
  const { branchName } = useBranchName();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<BranchIssue | null>(null);
  const { data, isLoading, isError, error } = useBranchIssues({ targetBranchId: '', dateFrom: '', dateTo: '' }, search.trim(), page, pageSize);

  const exportExcel = async () => {
    const rows = (await api.get<BranchIssueResult>('/inventory-transactions/branch-issues', { params: { search: search.trim(), page: 1, pageSize: 500 } })).data.data;
    await downloadExcel(
      rows.map((r, i) => ({ n: i + 1, id: r.id, branch: branchName(r.targetBranchId), qty: r.totalQuantity, cost: r.totalAmount })),
      [{ key: 'n', header: 'م' }, { key: 'id', header: 'رقم الفاتورة' }, { key: 'branch', header: 'الفرع' }, { key: 'qty', header: 'الكمية المصروفة' }, { key: 'cost', header: 'التكلفة الكلية' }],
      'اوامر-الصرف-للافرع',
    );
  };

  return (
    <InventoryPageShell title="أوامر الصرف للأفرع" description="أوامر صرف البضاعة من المخزن إلى الفروع (التحويلات المعتمدة)">
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button asChild><Link to="/inventory/transactions"><Plus className="size-4" /> إضافة أمر صرف جديد</Link></Button>
            <Button variant="outline" disabled={!data?.total} onClick={() => void exportExcel().catch((e) => toast.error(apiError(e)))}><FileSpreadsheet className="size-4" /> شيت إكسل</Button>
          </div>
          <div className="flex items-center gap-2"><Label htmlFor="issue-search">ابحث:</Label><Input id="issue-search" className="w-56" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="رقم الفاتورة أو الصنف" /></div>
        </div>
        {isError && <p className="px-4 py-2 text-sm text-destructive">{apiError(error)}</p>}
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader><TableRow><TableHead className="w-16">م</TableHead><TableHead>رقم الفاتورة</TableHead><TableHead>الفرع</TableHead><TableHead>الكمية المصروفة</TableHead><TableHead>التكلفة الكلية</TableHead><TableHead>الإجراء</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={6} className="py-8 text-center">جاري التحميل...</TableCell></TableRow>
                : data?.data.length ? data.data.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell>{(page - 1) * pageSize + index + 1}</TableCell>
                    <TableCell className="nums font-semibold">{row.id}</TableCell>
                    <TableCell className="font-semibold">{branchName(row.targetBranchId)}</TableCell>
                    <TableCell className="nums">{row.totalQuantity}</TableCell>
                    <TableCell className="nums">{money(row.totalAmount)}</TableCell>
                    <TableCell><Button size="sm" onClick={() => setSelected(row)}><Eye className="size-4" /> التفاصيل</Button></TableCell>
                  </TableRow>
                ))
                : <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد أوامر صرف معتمدة</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="border-t px-4 py-3"><Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></div>
      </section>
      <IssueDetailsDialog issue={selected} onClose={() => setSelected(null)} branchName={branchName} />
    </InventoryPageShell>
  );
}

/** تقرير الأصناف المصروفة للأفرع — with quantity-only (decrease) edit and delete. */
export function InventoryBranchIssuedItemsReportPage() {
  const { branches, branchName } = useBranchName();
  const { can } = usePermission();
  const canUpdate = can('gym-sales.inventory.transactions:update');
  const canDelete = can('gym-sales.inventory.transactions:delete');
  const today = localToday();
  const [draft, setDraft] = useState<Filters>({ targetBranchId: '', dateFrom: `${today.slice(0, 8)}01`, dateTo: today });
  const [applied, setApplied] = useState<Filters>(draft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<BranchIssue | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, error, refetch } = useBranchIssues(applied, '', page, pageSize);

  const openEdit = (row: BranchIssue) => {
    setEditing(row);
    setQuantities(Object.fromEntries(row.items.map((item) => [item.id, String(item.quantity)])));
  };

  const changes = useMemo(() => (editing?.items ?? [])
    .map((item) => ({ item, next: Number(quantities[item.id]) }))
    .filter(({ item, next }) => quantities[item.id] !== undefined && next !== item.quantity), [editing, quantities]);

  const saveEdit = async () => {
    if (!editing) return;
    const invalid = changes.find(({ item, next }) => !Number.isFinite(next) || next < 0 || next > item.quantity);
    if (invalid) {
      toast.error(`كمية ${invalid.item.itemName} يجب أن تكون بين ٠ و ${invalid.item.quantity} (التعديل بالنقص فقط)`);
      return;
    }
    if (!changes.length) { setEditing(null); return; }
    setBusy(true);
    try {
      await api.patch(`/inventory-transactions/${editing.id}/branch-issue-quantities`, { items: changes.map(({ item, next }) => ({ itemId: item.id, quantity: next })) });
      toast.success('تم تعديل الكميات وإرجاع الفرق للمخزن المصدر');
      setEditing(null);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: BranchIssue) => {
    if (!window.confirm(`حذف أمر الصرف رقم ${row.id}؟ سيتم إرجاع كل الأصناف من ${branchName(row.targetBranchId)} إلى المخزن المصدر.`)) return;
    setBusy(true);
    try {
      await api.delete(`/inventory-transactions/${row.id}/branch-issue`);
      toast.success('تم حذف أمر الصرف وإرجاع الكميات');
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const search = () => {
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) { toast.error('حدد فترة تاريخ صحيحة'); return; }
    setApplied(draft);
    setPage(1);
  };

  return (
    <InventoryPageShell title="تقرير الأصناف المصروفة للأفرع" description="الأصناف والكميات المصروفة لكل فرع خلال فترة، مع تعديل الكمية بالنقص أو الحذف">
      <section className="rounded-xl border bg-card p-4">
        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label htmlFor="bi-branch">اسم الفرع</Label><select id="bi-branch" className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={draft.targetBranchId} onChange={(e) => setDraft((f) => ({ ...f, targetBranchId: e.target.value }))}><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><Label htmlFor="bi-from">من</Label><Input id="bi-from" className="mt-2" type="date" value={draft.dateFrom} onChange={(e) => setDraft((f) => ({ ...f, dateFrom: e.target.value }))} /></div>
          <div><Label htmlFor="bi-to">إلى</Label><Input id="bi-to" className="mt-2" type="date" value={draft.dateTo} onChange={(e) => setDraft((f) => ({ ...f, dateTo: e.target.value }))} /></div>
          <Button onClick={search}><Search className="size-4" /> بحث</Button>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3 font-semibold">نتائج البحث</div>
        {isError && <p className="px-4 py-2 text-sm text-destructive">{apiError(error)}</p>}
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader><TableRow><TableHead className="w-16">مسلسل</TableHead><TableHead>تاريخ اليوم</TableHead><TableHead>رقم الصرف</TableHead><TableHead>اسم الفرع المصروف إليه</TableHead><TableHead>الأصناف</TableHead><TableHead>الكميات</TableHead>{(canUpdate || canDelete) && <TableHead>تعديل</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={7} className="py-8 text-center">جاري التحميل...</TableCell></TableRow>
                : data?.data.length ? data.data.map((row, index) => (
                  <TableRow key={row.id} className="align-top">
                    <TableCell>{(page - 1) * pageSize + index + 1}</TableCell>
                    <TableCell className="nums">{day(row.txnDate)}</TableCell>
                    <TableCell className="nums">{row.id}</TableCell>
                    <TableCell>{branchName(row.targetBranchId)}</TableCell>
                    <TableCell>{row.items.map((item, i) => <div key={item.id}>{i + 1}-{item.itemName}</div>)}</TableCell>
                    <TableCell className="nums">{row.items.map((item) => <div key={item.id}>{item.quantity}</div>)}</TableCell>
                    {(canUpdate || canDelete) && (
                      <TableCell>
                        <div className="flex gap-1">
                          {canUpdate && <Button size="sm" variant="outline" disabled={busy} onClick={() => openEdit(row)}><Pencil className="size-4" /> تعديل</Button>}
                          {canDelete && <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove(row)}><Trash2 className="size-4" /> حذف</Button>}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
                : <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">لا توجد أصناف مصروفة في هذه الفترة</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="border-t px-4 py-3"><Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></div>
      </section>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>تعديل فواتير الأصناف الفرعية</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label>اسم الفرع</Label><Input className="mt-2" readOnly value={branchName(editing.targetBranchId)} /></div>
                <div><Label>تاريخ الفاتورة</Label><Input className="mt-2" readOnly value={day(editing.txnDate)} /></div>
                <div><Label>رقم الفاتورة</Label><Input className="mt-2 nums" readOnly value={editing.id} /></div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>مسلسل</TableHead><TableHead>الأصناف</TableHead><TableHead>السعر وقتها</TableHead><TableHead>الكميات</TableHead><TableHead>تعديل الكمية لأقل فقط</TableHead></TableRow></TableHeader>
                <TableBody>
                  {editing.items.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{item.itemName}</TableCell>
                      <TableCell className="nums">{money(item.price)}</TableCell>
                      <TableCell className="nums">{item.quantity}</TableCell>
                      <TableCell><Input className="nums" type="number" min={0} max={item.quantity} value={quantities[item.id] ?? ''} onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">الفرق بين الكمية القديمة والجديدة يُرجع تلقائيًا من مخزن الفرع إلى المخزن المصدر. وضع الكمية ٠ يحذف الصنف من الأمر.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <Button onClick={() => void saveEdit()} disabled={busy}>{busy ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InventoryPageShell>
  );
}
