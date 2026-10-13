import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, FileSpreadsheet, Printer, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { downloadExcel } from '@/lib/export';
import { useAuth } from '@/store/auth';

type Filters = {
  branch: string;
  gender: 'all' | 'male' | 'female';
  memberCode: string;
  startDate: string;
  endDate: string;
  fromTime: string;
  toTime: string;
};

type ScanRow = {
  id: number;
  memberCode: string;
  memberName: string;
  branchId: number;
  attendanceDate: string;
  checkInTime: string;
  scanType: string;
};

type ScanResult = { data: ScanRow[]; total: number; page: number; pageSize: number };

function cairoDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDay(value: string, amount: number): string {
  const day = new Date(`${value}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
}

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true,
});
const clock = (value: string) => clockFormatter.format(new Date(value));

export function ClubBarcodeScanTimesPage() {
  const user = useAuth((state) => state.user);
  const { superAdmin } = usePermission();
  const isAdmin = user?.level === 1 || superAdmin;
  const { data: branches = [] } = useBranches();
  const today = cairoDate();
  const initialBranch = isAdmin ? '' : String(user?.branch ?? '');
  const [draft, setDraft] = useState<Filters>({
    branch: initialBranch,
    gender: 'all',
    memberCode: '',
    startDate: shiftDay(today, -6),
    endDate: today,
    fromTime: '',
    toTime: '',
  });
  const [applied, setApplied] = useState<Filters>(draft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [printRows, setPrintRows] = useState<ScanRow[] | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (isAdmin || !user?.branch) return;
    const branch = String(user.branch);
    setDraft((value) => ({ ...value, branch }));
    setApplied((value) => ({ ...value, branch }));
  }, [isAdmin, user?.branch]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setAppliedSearch(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const clear = () => setPrintRows(null);
    window.addEventListener('afterprint', clear);
    return () => window.removeEventListener('afterprint', clear);
  }, []);

  const baseParams = useMemo(() => ({
    ...(applied.branch ? { branch: applied.branch } : {}),
    gender: applied.gender,
    ...(applied.memberCode ? { memberCode: applied.memberCode } : {}),
    startDate: applied.startDate,
    endDate: applied.endDate,
    ...(applied.fromTime ? { fromTime: applied.fromTime } : {}),
    ...(applied.toTime ? { toTime: applied.toTime } : {}),
  }), [applied]);
  const params = useMemo(() => ({
    ...baseParams,
    search: appliedSearch,
    page,
    pageSize,
  }), [baseParams, appliedSearch, page, pageSize]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['barcode-scan-times', params],
    queryFn: async () => (await api.get<ScanResult>('/club-attendance/barcode-scan-times', { params })).data,
  });

  const branchName = (id: number) => branches.find((branch) => branch.id === id)?.name ?? String(id);
  const visibleRows = printRows ?? data?.data ?? [];
  const allowedBranches = isAdmin ? branches : branches.filter((branch) => branch.id === user?.branch);

  const applyFilters = () => {
    if (!draft.startDate || !draft.endDate || draft.startDate > draft.endDate) {
      toast.error('حدد فترة تاريخ صحيحة');
      return;
    }
    if (draft.fromTime && draft.toTime && draft.fromTime > draft.toTime) {
      toast.error('وقت البداية يجب أن يسبق وقت النهاية');
      return;
    }
    setApplied({ ...draft, memberCode: draft.memberCode.trim() });
    setPage(1);
  };

  const fetchAllRows = async () => {
    const first = (await api.get<ScanResult>('/club-attendance/barcode-scan-times', {
      params: { ...baseParams, search: appliedSearch, page: 1, pageSize: 500 },
    })).data;
    if (first.total > 10_000) throw new Error('النتائج أكثر من ١٠٬٠٠٠ صف؛ قلل فترة التقرير قبل التصدير');
    const rows = [...first.data];
    for (let nextPage = 2; nextPage <= Math.ceil(first.total / 500); nextPage += 1) {
      const next = (await api.get<ScanResult>('/club-attendance/barcode-scan-times', {
        params: { ...baseParams, search: appliedSearch, page: nextPage, pageSize: 500 },
      })).data;
      rows.push(...next.data);
    }
    return rows;
  };

  const runExport = async (action: 'copy' | 'excel' | 'print') => {
    setExporting(true);
    try {
      const rows = await fetchAllRows();
      const lines = rows.map((row, index) => ({
        number: index + 1,
        code: row.memberCode,
        name: row.memberName,
        branch: branchName(row.branchId),
        date: row.attendanceDate,
        time: clock(row.checkInTime),
        type: row.scanType,
      }));
      const columns = [
        { key: 'number', header: 'م' },
        { key: 'code', header: 'كود العضو' },
        { key: 'name', header: 'اسم العضو' },
        { key: 'branch', header: 'الفرع' },
        { key: 'date', header: 'التاريخ' },
        { key: 'time', header: 'الوقت' },
        { key: 'type', header: 'نوع السحب' },
      ] as const;
      if (action === 'copy') {
        await navigator.clipboard.writeText([columns.map((column) => column.header).join('\t'),
          ...lines.map((row) => columns.map((column) => String(row[column.key])).join('\t'))].join('\n'));
        toast.success('تم نسخ التقرير');
      } else if (action === 'excel') {
        await downloadExcel(lines, [...columns], `barcode-scan-times-${applied.startDate}-${applied.endDate}.xlsx`, 'توقيتات سحب الباركود');
      } else {
        setPrintRows(rows);
        window.setTimeout(() => window.print(), 100);
      }
    } catch (caught) {
      toast.error(caught instanceof Error && caught.message.startsWith('النتائج أكثر') ? caught.message : apiError(caught));
    } finally {
      setExporting(false);
    }
  };

  return <div className="w-full space-y-5">
    <style>{'@media print { @page { size: A4 landscape; margin: 9mm; } .barcode-times-filters, .barcode-times-toolbar, .barcode-times-pagination { display: none !important; } .barcode-times-table { overflow: visible !important; } }'}</style>
    <PageHeader title="توقيتات سحب الباركود" description="عرض توقيتات سحب باركود الأعضاء حسب الفرع والفترة والوقت" />

    <section className="barcode-times-filters w-full rounded-xl border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><Label htmlFor="scan-branch">اسم الفرع</Label><select id="scan-branch" className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={draft.branch} onChange={(event) => setDraft((value) => ({ ...value, branch: event.target.value }))}><option value="">كل الفروع</option>{allowedBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
        <div><Label htmlFor="scan-gender">حريمي-رجالي</Label><select id="scan-gender" className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={draft.gender} onChange={(event) => setDraft((value) => ({ ...value, gender: event.target.value as Filters['gender'] }))}><option value="all">الكل</option><option value="male">رجالي</option><option value="female">حريمي</option></select></div>
        <div><Label htmlFor="scan-code">كود العضو</Label><Input id="scan-code" className="mt-2" value={draft.memberCode} onChange={(event) => setDraft((value) => ({ ...value, memberCode: event.target.value }))} /></div>
        <div><Label htmlFor="scan-start-date">من تاريخ</Label><Input id="scan-start-date" className="mt-2" type="date" value={draft.startDate} onChange={(event) => setDraft((value) => ({ ...value, startDate: event.target.value }))} /></div>
        <div><Label htmlFor="scan-end-date">إلى تاريخ</Label><Input id="scan-end-date" className="mt-2" type="date" value={draft.endDate} onChange={(event) => setDraft((value) => ({ ...value, endDate: event.target.value }))} /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-44"><Label htmlFor="scan-from-time">الوقت من</Label><Input id="scan-from-time" className="mt-2" type="time" value={draft.fromTime} onChange={(event) => setDraft((value) => ({ ...value, fromTime: event.target.value }))} /></div>
        <div className="w-44"><Label htmlFor="scan-to-time">الوقت إلى</Label><Input id="scan-to-time" className="mt-2" type="time" value={draft.toTime} onChange={(event) => setDraft((value) => ({ ...value, toTime: event.target.value }))} /></div>
        <Button onClick={applyFilters}><Search className="size-4" /> عرض التقرير</Button>
      </div>
    </section>

    <section className="w-full rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3 font-semibold">نتيجة عرض توقيتات سحب الباركود</div>
      <div className="barcode-times-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={exporting || !data?.total} onClick={() => void runExport('copy')}><Copy className="size-4" /> نسخ</Button>
          <Button size="sm" variant="outline" disabled={exporting || !data?.total} onClick={() => void runExport('print')}><Printer className="size-4" /> طباعة</Button>
          <Button size="sm" variant="outline" disabled={exporting || !data?.total} onClick={() => void runExport('excel')}><FileSpreadsheet className="size-4" /> شيت إكسل</Button>
          <span className="text-sm text-muted-foreground">{data?.total ?? 0} سحب</span>
        </div>
        <div className="flex items-center gap-2"><Label htmlFor="scan-table-search">ابحث:</Label><Input id="scan-table-search" className="w-56" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="الكود أو الاسم" /></div>
      </div>
      {isError && <p className="px-4 pb-4 text-sm text-destructive">{apiError(error)}</p>}
      <div className="barcode-times-table w-full overflow-x-auto">
        <Table className="w-full min-w-[800px]">
          <TableHeader><TableRow><TableHead className="w-16">م</TableHead><TableHead>كود العضو</TableHead><TableHead>اسم العضو</TableHead><TableHead>الفرع</TableHead><TableHead>التاريخ</TableHead><TableHead>الوقت</TableHead><TableHead>نوع السحب</TableHead></TableRow></TableHeader>
          <TableBody>{isLoading ? <TableRow><TableCell colSpan={7} className="py-8 text-center">جاري تحميل التقرير...</TableCell></TableRow> : visibleRows.length ? visibleRows.map((row, index) => <TableRow key={row.id}>
            <TableCell>{printRows ? index + 1 : (page - 1) * pageSize + index + 1}</TableCell>
            <TableCell className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{row.memberCode}</TableCell>
            <TableCell>{row.memberName}</TableCell>
            <TableCell>{branchName(row.branchId)}</TableCell>
            <TableCell dir="ltr" className="text-start font-mono">{row.attendanceDate}</TableCell>
            <TableCell dir="ltr" className="text-start font-mono">{clock(row.checkInTime)}</TableCell>
            <TableCell className={row.scanType === 'عادي' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-amber-700 dark:text-amber-400'}>{row.scanType}</TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">لا توجد سحوبات مطابقة للفلاتر</TableCell></TableRow>}</TableBody>
        </Table>
      </div>
      <div className="barcode-times-pagination border-t px-4 py-3"><Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></div>
    </section>
  </div>;
}
