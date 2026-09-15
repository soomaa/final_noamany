import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { FileText, Package, Receipt, Truck, Users, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '@/components/common/data-table';
import { StatCard } from '@/components/common/stat-card';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { SupplierDashboardStats, SupplierReportRow } from '@/types/gym-sales';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';

export function ProcurementDashboardPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const branchId = params.filters.branchId ?? 'all';

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['supplier-dashboard', 'stats', branchId],
    queryFn: async () => {
      const { data: s } = await api.get<SupplierDashboardStats>('/supplier-dashboard/stats', {
        params: branchId !== 'all' ? { branchId } : {},
      });
      return s;
    },
  });

  const { data: reports, isLoading: reportsLoading, isError, refetch } = usePaginatedList<SupplierReportRow>(
    'supplier-reports/reports',
    params,
  );

  const columns = useMemo<ColumnDef<SupplierReportRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<SupplierReportRow>,
      { accessorKey: 'nameAr', header: ui('المورد') },
      { accessorKey: 'phone', header: ui('الهاتف'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'orderCount',
        header: ui('عدد الأوامر'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'totalOrderValue',
        header: ui('إجمالي المشتريات'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ui('الحالة'),
        cell: ({ getValue }) => (getValue() ? ui('نشط') : ui('غير نشط')),
      },
    ],
    [params.page, params.pageSize, ui],
  );

  return (
    <GymSalesPageShell
      section="procurement"
      title={ui('لوحة الموردين')}
      description={ui('مؤشرات المشتريات وتقارير أداء الموردين')}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">{ui('الفرع')}</label>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={branchId}
          onChange={(e) => setParams({ filters: { branchId: e.target.value }, page: 1 })}
        >
          <option value="all">{ui('كل الفروع')}</option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={String(b.id)}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={ui('الموردون')}
          value={statsLoading ? '…' : toArabicDigits(stats?.totalSuppliers ?? 0)}
          icon={<Users className="h-5 w-5" />}
          loading={statsLoading}
        />
        <StatCard
          title={ui('العقود النشطة')}
          value={statsLoading ? '…' : toArabicDigits(stats?.activeContracts ?? 0)}
          icon={<FileText className="h-5 w-5" />}
          colorIndex={1}
          loading={statsLoading}
        />
        <StatCard
          title={ui('أوامر الشراء')}
          value={statsLoading ? '…' : toArabicDigits(stats?.totalPurchaseOrders ?? 0)}
          icon={<Truck className="h-5 w-5" />}
          colorIndex={2}
          loading={statsLoading}
        />
        <StatCard
          title={ui('قيمة المشتريات')}
          value={statsLoading ? '…' : toArabicDigits(Math.round(stats?.totalPurchaseValue ?? 0))}
          icon={<Package className="h-5 w-5" />}
          colorIndex={3}
          loading={statsLoading}
        />
        <StatCard
          title={ui('الفواتير')}
          value={statsLoading ? '…' : toArabicDigits(stats?.totalInvoices ?? 0)}
          icon={<Receipt className="h-5 w-5" />}
          colorIndex={4}
          loading={statsLoading}
        />
        <StatCard
          title={ui('قيمة الفواتير')}
          value={statsLoading ? '…' : toArabicDigits(Math.round(stats?.totalInvoiceValue ?? 0))}
          icon={<Wallet className="h-5 w-5" />}
          colorIndex={5}
          loading={statsLoading}
        />
        <StatCard
          title={ui('دفعات معلقة')}
          value={statsLoading ? '…' : toArabicDigits(stats?.pendingPayments ?? 0)}
          colorIndex={6}
          loading={statsLoading}
        />
        <StatCard
          title={ui('فواتير متأخرة')}
          value={statsLoading ? '…' : toArabicDigits(stats?.overdueInvoices ?? 0)}
          colorIndex={7}
          loading={statsLoading}
        />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-4 font-semibold">{ui('تقرير الموردين')}</h3>
        <DataTable
          columns={columns}
          data={reports?.data ?? []}
          total={reports?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(page) => setParams({ page })}
          onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
          search={params.search}
          onSearchChange={(search) => setParams({ search, page: 1 })}
          isLoading={reportsLoading}
          isError={isError}
          onRetry={() => void refetch()}
        />
      </div>
    </GymSalesPageShell>
  );
}
