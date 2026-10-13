import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { confirm, afterMenuClose } from '@/lib/confirm';
import { MoreHorizontal, Eye, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Locker = { id: number; locker_number: string; is_available: boolean };
type ReportItem = { id: number; observed_status: string; notes: string | null; locker: Locker };
type Report = { id: number; branch_id: number; employee_id: number | null; employee_name: string | null; notes: string | null; status: string; created_at: string; items: ReportItem[] };

const STATUS_MAP: Record<string, string> = { pending_review: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض' };
const STATUS_COLORS: Record<string, string> = { approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', pending_review: 'bg-yellow-100 text-yellow-700' };

export function ClubLockerInventoryReportsPage() {
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: reports = [], refetch: refetchReports } = useQuery({
    queryKey: ['locker-inventory-reports', branchId, fromDate, toDate],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (branchId) params.branchId = branchId;
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      return (await api.get<Report[]>('/club-lockers/inventory-reports', { params })).data;
    },
  });

  const hasFilters = !!branchId || !!fromDate || !!toDate;

  const handleDelete = async (r: Report) => {
    const ok = await confirm({ title: 'حذف تقرير الجرد', description: `هل تريد حذف تقرير الجرد #${r.id}؟`, variant: 'destructive' });
    if (!ok) return;
    try {
      await api.delete(`/club-lockers/inventory-reports/${r.id}`);
      toast.success('تم الحذف');
      void refetchReports();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const [detailReport, setDetailReport] = useState<Report | null>(null);

  return (
    <div className="space-y-5">
      <PageHeader title="تقارير جرد اللوكر" description="عرض وفلترة تقارير جرد اللوكر حسب الفرع والتاريخ" />

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <Label>الفرع</Label>
            <select className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">كل الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-[180px]">
            <Label>من تاريخ</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-2 h-10" />
          </div>

          <div className="flex-1 min-w-[180px]">
            <Label>إلى تاريخ</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-2 h-10" />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="icon" onClick={() => { setBranchId(''); setFromDate(''); setToDate(''); }} className="self-end">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {reports.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>التاريخ والوقت</TableHead>
                  <TableHead>الموظف</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-center">عدد اللوكرات</TableHead>
                  <TableHead className="w-24 text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.id}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleString('ar-EG')}</TableCell>
                    <TableCell>{r.employee_name ?? '—'}</TableCell>
                    <TableCell>{branches.find((b) => b.id === r.branch_id)?.name ?? r.branch_id}</TableCell>
                    <TableCell>
                      <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-700')}>
                        {STATUS_MAP[r.status] ?? r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{r.items.length}</TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => afterMenuClose(() => setDetailReport(r))}><Eye className="size-4" /> التفاصيل</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onSelect={() => void handleDelete(r)}><Trash2 className="size-4" /> حذف</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد تقارير لهذا الفرع.</p>
        )}
      </div>

      <Dialog open={!!detailReport} onOpenChange={(o) => { if (!o) setDetailReport(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل تقرير الجرد #{detailReport?.id}</DialogTitle>
          </DialogHeader>
          {detailReport && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">التاريخ:</span> {new Date(detailReport.created_at).toLocaleString('ar-EG')}</div>
                <div><span className="text-muted-foreground">الموظف:</span> {detailReport.employee_name ?? '—'}</div>
                <div><span className="text-muted-foreground">الحالة:</span> {STATUS_MAP[detailReport.status] ?? detailReport.status}</div>
                <div><span className="text-muted-foreground">ملاحظات عامة:</span> {detailReport.notes || 'بدون'}</div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>رقم اللوكر</TableHead>
                      <TableHead>الحالة الفعلية</TableHead>
                      <TableHead>ملاحظة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailReport.items.map((it, i) => (
                      <TableRow key={it.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-mono">{it.locker.locker_number}</TableCell>
                        <TableCell>
                          {it.observed_status === 'available' ? 'متاح' :
                           it.observed_status === 'occupied' ? 'مشغول' :
                           it.observed_status === 'maintenance' ? 'صيانة' :
                           it.observed_status === 'missing' ? 'غير موجود' : it.observed_status}
                        </TableCell>
                        <TableCell>{it.notes || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}