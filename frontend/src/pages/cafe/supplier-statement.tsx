import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Landmark, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { downloadExcel } from '@/lib/export';
import { toArabicDigits } from '@/lib/utils';
import { InventoryPageShell } from '@/pages/inventory/inventory-shell';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

interface StatementLine {
  date: string;
  reference: string;
  operation: string;
  branchName: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementRow extends StatementLine, Record<string, unknown> {
  index: number;
}

interface SupplierStatement {
  supplierId: number;
  supplierName: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  rows: StatementLine[];
}

interface StatementFilters {
  supplierId: string;
  branchId: string;
  dateFrom: string;
  dateTo: string;
}

const amount = (value: number) => toArabicDigits(value.toFixed(2));

export function CafeSupplierStatementPage() {
  const { ui } = useLocale();
  const user = useAuth((state) => state.user);
  const lockedBranch = !!user?.branch && user.branch > 0;
  const { data: branches = [] } = useBranches();
  const [draft, setDraft] = useState<StatementFilters>({ supplierId: '', branchId: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState<StatementFilters | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['supplier-statement-suppliers'],
    queryFn: async () => (await api.get<Array<{ id: number; name: string }>>('/supplier-payments/statement/suppliers')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['supplier-statement', 'report', applied],
    enabled: !!applied,
    queryFn: async () => (await api.get<SupplierStatement>('/supplier-payments/statement', {
      params: {
        supplierId: applied!.supplierId,
        branchId: applied!.branchId || undefined,
        dateFrom: applied!.dateFrom || undefined,
        dateTo: applied!.dateTo || undefined,
      },
    })).data,
  });

  // The opening row mirrors the classic statement layout: balance carried in before the period.
  const allRows = useMemo<StatementRow[]>(() => {
    if (!data) return [];
    const opening: StatementRow = {
      index: 1,
      date: '-',
      reference: '',
      operation: ui('رصيد أول'),
      branchName: null,
      debit: data.openingBalance < 0 ? -data.openingBalance : 0,
      credit: data.openingBalance > 0 ? data.openingBalance : 0,
      balance: data.openingBalance,
    };
    return [opening, ...data.rows.map((row, i) => ({ ...row, operation: ui(row.operation), index: i + 2 }))];
  }, [data, ui]);

  const filteredRows = useMemo(() => {
    const term = search.trim();
    if (!term) return allRows;
    return allRows.filter((row) =>
      [row.date, row.reference, row.operation, row.branchName ?? '', row.debit.toFixed(2), row.credit.toFixed(2)]
        .some((value) => value.includes(term)),
    );
  }, [allRows, search]);
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const columns = useMemo<ColumnDef<StatementRow>[]>(() => [
    { accessorKey: 'index', header: '#', size: 50, cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
    { accessorKey: 'date', header: ui('التاريخ'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
    {
      accessorKey: 'operation',
      header: ui('العملية'),
      cell: ({ row }) => (
        <div>
          <span>{row.original.operation}</span>
          {row.original.reference ? <span className="nums block text-xs text-muted-foreground">{row.original.reference}</span> : null}
        </div>
      ),
    },
    { accessorKey: 'branchName', header: ui('الفرع'), cell: ({ getValue }) => (getValue() as string | null) ?? '-' },
    { accessorKey: 'debit', header: ui('مدين'), cell: ({ getValue }) => <span className="nums">{(getValue() as number) ? amount(getValue() as number) : '-'}</span> },
    { accessorKey: 'credit', header: ui('دائن'), cell: ({ getValue }) => <span className="nums">{(getValue() as number) ? amount(getValue() as number) : '-'}</span> },
    { accessorKey: 'balance', header: ui('رصيد'), cell: ({ getValue }) => <span className="nums font-semibold">{amount(getValue() as number)}</span> },
  ], [ui]);

  const show = () => {
    if (!draft.supplierId) return toast.error(ui('اختر المورد'));
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) return toast.error(ui('تاريخ البداية بعد تاريخ النهاية'));
    setPage(1);
    setApplied({ ...draft });
  };

  const exportExcel = async () => {
    if (!data) return;
    await downloadExcel(filteredRows, [
      { key: 'index', header: '#' },
      { key: 'date', header: ui('التاريخ') },
      { key: 'operation', header: ui('العملية') },
      { key: 'reference', header: ui('المستند') },
      { key: 'branchName', header: ui('الفرع') },
      { key: 'debit', header: ui('مدين') },
      { key: 'credit', header: ui('دائن') },
      { key: 'balance', header: ui('رصيد') },
    ], `كشف_حساب_${data.supplierName}`, ui('كشف حساب مورد'));
  };

  return (
    <InventoryPageShell
      title={ui('كشف حساب مورد')}
      description={ui('حركة حساب المورد من فواتير الشراء والسداد والمرتجعات مع الرصيد التراكمي لكل فرع')}
    >
      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-2"><Users className="size-4" />{ui('الموردين')}</Label>
            <select className="min-h-10 rounded-md border bg-background px-3 text-sm" value={draft.supplierId} onChange={(event) => setDraft({ ...draft, supplierId: event.target.value })}>
              <option value="">{ui('اختر المورد')}</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>{ui('الفرع')}</Label>
            {lockedBranch
              ? <div className="flex min-h-10 items-center rounded-md bg-muted/50 px-3 text-sm">{user?.branch_name || `${ui('فرع رقم')} ${user?.branch}`}</div>
              : (
                <select className="min-h-10 rounded-md border bg-background px-3 text-sm" value={draft.branchId} onChange={(event) => setDraft({ ...draft, branchId: event.target.value })}>
                  <option value="">{ui('كل الفروع')}</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              )}
          </div>
          <div className="grid gap-1.5">
            <Label>{ui('من تاريخ')}</Label>
            <Input type="date" value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>{ui('إلى تاريخ')}</Label>
            <Input type="date" value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} />
          </div>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={show}>
            <Search className="size-4" />{ui('عرض')}
          </Button>
        </CardContent>
      </Card>

      {applied ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
              <span className="flex items-center gap-2"><Landmark className="size-5 text-primary" />{ui('تفاصيل كشف الحساب')}{data ? ` — ${data.supplierName}` : ''}</span>
              {data ? (
                <span className="flex flex-wrap gap-4 text-sm font-normal">
                  <span>{ui('إجمالي مدين')}: <strong className="nums">{amount(data.totalDebit)}</strong></span>
                  <span>{ui('إجمالي دائن')}: <strong className="nums">{amount(data.totalCredit)}</strong></span>
                  <span>{ui('الرصيد')}: <strong className="nums text-amber-700">{amount(data.balance)}</strong></span>
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={pageRows}
              total={filteredRows.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              isLoading={isLoading}
              isError={isError}
              onRetry={() => void refetch()}
              search={search}
              onSearchChange={(value) => { setSearch(value); setPage(1); }}
              searchPlaceholder={ui('ابحث في كشف الحساب…')}
              onExportExcel={exportExcel}
              emptyTitle={ui('لا توجد حركات لهذا المورد')}
            />
          </CardContent>
        </Card>
      ) : null}
    </InventoryPageShell>
  );
}
