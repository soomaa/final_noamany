import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileText, Plus, Ruler, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { uploadUrl } from '@/components/employees/use-uploads';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { InbodyMeasurementRow } from '@/types/fitness';
import { INBODY_SETTLEMENT_LABELS, memberColumnDef } from './shared';
import { InbodyRecordDialog } from './inbody-record-dialog';
import { InbodySettingsTab } from './inbody-settings-tab';
import { InbodyMemberProfileDialog } from './inbody-member-profile-dialog';
import { useLocale } from '@/store/locale';

export function FitnessInbodyPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<InbodyMeasurementRow>(
    'club-inbody-measurements',
    params,
  );
  const { data: branches } = useBranches();
  const { can } = usePermission();
  const canCreate = can('club.fitness.inbody_invoices:create');
  const canManageSettings = can('club.fitness.inbody_invoices:update');
  const [tab, setTab] = useState('measurements');
  const [recordOpen, setRecordOpen] = useState(false);
  const [profileMemberId, setProfileMemberId] = useState<number | null>(null);
  const branchNames = useMemo(
    () => new Map((branches ?? []).map((branch) => [branch.id, branch.name ?? '—'])),
    [branches],
  );

  const columns = useMemo<ColumnDef<InbodyMeasurementRow>[]>(
    () => [
      memberColumnDef<InbodyMeasurementRow>(ui('العضو')),
      {
        accessorKey: 'measurementDate',
        header: ui('تاريخ القياس'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'branchId',
        header: ui('الفرع'),
        cell: ({ getValue }) => branchNames.get(getValue() as number) ?? '—',
      },
      {
        accessorKey: 'settlementSource',
        header: ui('طريقة التسوية'),
        cell: ({ getValue }) => {
          const source = getValue() as InbodyMeasurementRow['settlementSource'];
          return (
            <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {INBODY_SETTLEMENT_LABELS[source] ?? INBODY_SETTLEMENT_LABELS.legacy}
            </span>
          );
        },
      },
      {
        accessorKey: 'reportUrl',
        header: ui('تقرير الجهاز'),
        cell: ({ getValue }) => {
          const href = uploadUrl(getValue() as string | null | undefined);
          return href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand underline underline-offset-4"
            >
              <FileText className="size-4" /> {ui('عرض التقرير')}
            </a>
          ) : <span className="text-muted-foreground">{ui('غير مرفوع')}</span>;
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            title={ui('بروفايل InBody')}
            onClick={() => setProfileMemberId(row.original.memberId)}
          >
            <Eye className="size-4" />
          </Button>
        ),
      },
    ],
    [branchNames],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('قياسات InBody')}
        description={ui('سجّل تقارير الجهاز، تابع رصيد العضو، وحصّل القياس تلقائيًا عند عدم وجود رصيد.')}
        actions={tab === 'measurements' && canCreate ? (
          <Button variant="brand" onClick={() => setRecordOpen(true)}>
            <Plus className="size-4" /> {ui('تسجيل قياس')}
          </Button>
        ) : undefined}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={ui('أقسام InBody')}>
          <TabsTrigger value="measurements" className="gap-2">
            <Ruler className="size-4" /> {ui('القياسات')}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings2 className="size-4" /> {ui('الإعدادات')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="measurements" className="mt-5">
          <DataTable
            exportSource={{ resource: 'club-inbody-measurements', params }}
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
            emptyTitle={ui('لا توجد قياسات InBody مسجلة')}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-5">
          {canManageSettings ? (
            <InbodySettingsTab />
          ) : (
            <div className="rounded-xl border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
              {ui('لا تملك صلاحية تعديل إعدادات InBody.')}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <InbodyRecordDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onSaved={() => void refetch()}
      />

      <InbodyMemberProfileDialog
        memberId={profileMemberId}
        open={profileMemberId != null}
        onOpenChange={(next) => { if (!next) setProfileMemberId(null); }}
      />
    </div>
  );
}
