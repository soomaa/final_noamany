import { CreditCard, IdCard, LayoutGrid, Printer, ScanBarcode, Search, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { EmptyState, ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
import { BarcodeLabel, BarcodePreview, printBarcodeLabels, type BarcodeLabelData } from '@/components/club/barcode-label';
import { ClubStatCard } from '@/components/club/stat-card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import { MemberAvatar, memberInitials } from '@/components/club/member-avatar';
import type { ColumnDef } from '@tanstack/react-table';

type ViewTab = 'barcodes' | 'membership' | 'table';

function MemberBarcodeCard({
  member,
  branch,
  onPrint,
  printLabel,
}: {
  member: ClubMemberListItem;
  branch: string | null;
  onPrint: () => void;
  printLabel: string;
}) {
  const ct = useClubT();
  const accent = member.gender === 'female' ? '#EC4899' : '#C99700';

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
      style={{ borderColor: `${accent}33` }}
    >
      <div
        className="h-1.5 w-full"
        style={{ background: `linear-gradient(to left, ${accent}, ${accent}88, ${accent}44)` }}
      />
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          {member.profilePicture ? (
            <MemberAvatar
              name={member.name}
              profilePicture={member.profilePicture}
              size="md"
              className="!size-12 !rounded-xl ring-0"
            />
          ) : (
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: accent }}
            >
              {memberInitials(member.name) || '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-tight">{member.name}</h3>
            <p className="nums mt-1 font-mono text-xs text-muted-foreground">{member.memberCode}</p>
            {branch && <p className="mt-0.5 truncate text-xs text-muted-foreground">{branch}</p>}
          </div>
          {!member.isActive && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {ct('common.inactive')}
            </span>
          )}
        </div>

        <div className="rounded-xl border bg-white px-4 py-4 shadow-inner dark:bg-zinc-950/80">
          <BarcodePreview code={member.memberCode} height={64} />
        </div>

        {member.cardNumber && (
          <p className="text-center text-xs text-muted-foreground">
            <span className="nums">{toArabicDigits(member.cardNumber)}</span>
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full opacity-90 transition-opacity group-hover:opacity-100"
          onClick={onPrint}
        >
          <Printer className="size-4" />
          {printLabel}
        </Button>
      </div>
    </article>
  );
}

function MembershipCard({ member }: { member: ClubMemberListItem }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm print:break-inside-avoid">
      <div className="flex items-center gap-2 text-primary">
        <CreditCard className="size-5" />
        <span className="text-xs font-bold uppercase tracking-wider">ONE80 Gym</span>
      </div>
      <MemberAvatar name={member.name} profilePicture={member.profilePicture} size="lg" className="mx-auto mt-3 ring-2 ring-primary/20" />
      <p className="mt-3 text-center text-lg font-bold">{member.name}</p>
      <p className="text-center font-mono text-sm nums text-muted-foreground">{member.memberCode}</p>
      <p className="mt-1 text-center text-xs text-muted-foreground">{member.membershipType?.name ?? '—'}</p>
      <p className="mt-2 text-center text-xs nums">{member.phone ? toArabicDigits(member.phone) : ''}</p>
    </div>
  );
}

function BarcodeCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <Skeleton className="h-1.5 w-full rounded-none" />
      <div className="space-y-4 p-5">
        <div className="flex gap-3">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
}

function MembershipCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mx-auto mt-3 size-20 rounded-full" />
      <Skeleton className="mx-auto mt-3 h-5 w-3/4" />
      <Skeleton className="mx-auto mt-2 h-4 w-1/2" />
    </div>
  );
}

export function ClubBarcodeManagementPage() {
  const ct = useClubT();
  const { params, setParams } = useListQuery();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const view: ViewTab =
    tabParam === 'membership' || tabParam === 'table' || tabParam === 'barcodes' ? tabParam : 'barcodes';

  const setView = (next: ViewTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        p.set('page', '1');
        return p;
      },
      { replace: true },
    );
  };

  const listParams = useMemo(
    () =>
      view === 'membership'
        ? { ...params, filters: { ...params.filters, status: 'active' } }
        : params,
    [params, view],
  );

  const { data, isLoading, isError, refetch } = usePaginatedList<ClubMemberListItem>('club-members', listParams);
  const { data: branches } = useBranches();
  const [printMember, setPrintMember] = useState<ClubMemberListItem | null>(null);

  const members = data?.data ?? [];
  const total = data?.total ?? 0;

  const branchName = (id: number) => branches?.find((b) => b.id === id)?.name ?? null;

  const toLabel = (m: ClubMemberListItem): BarcodeLabelData => ({
    code: m.memberCode,
    name: m.name,
    branch: branchName(m.branchId),
  });

  const printBarcodes = () => {
    if (!members.length) return;
    printBarcodeLabels(members.map(toLabel));
  };

  const printAction = () => {
    if (view === 'membership') window.print();
    else printBarcodes();
  };

  const columns = useMemo<ColumnDef<ClubMemberListItem>[]>(
    () => [
      {
        id: 'barcode',
        header: ct('members.barcodeCol'),
        cell: ({ row }) => (
          <div className="rounded-lg border bg-white px-3 py-2 dark:bg-zinc-950/60">
            <BarcodePreview code={row.original.memberCode} height={44} />
          </div>
        ),
      },
      { accessorKey: 'name', header: ct('members.name') },
      {
        accessorKey: 'memberCode',
        header: ct('members.memberCode'),
        cell: ({ getValue }) => <span className="nums font-mono font-semibold">{getValue() as string}</span>,
      },
      {
        accessorKey: 'cardNumber',
        header: ct('members.nationalId'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as string) ?? '—')}</span>,
      },
      {
        id: 'print',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setPrintMember(row.original)}>
            <Printer className="size-4" /> {ct('common.print')}
          </Button>
        ),
      },
    ],
    [ct],
  );

  const printLabel =
    view === 'membership' ? ct('members.cardsPrintPage') : ct('members.barcodePrintPage');

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title={ct('members.barcodeMgmtTitle')}
        description={view === 'membership' ? ct('members.cardsDesc') : ct('members.barcodeMgmtDesc')}
        className="print:hidden"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <ClubStatCard label={ct('members.name')} value={total} icon={ScanBarcode} tone="members" />
        <ClubStatCard label={ct('members.barcodeTabCards')} value={members.length} icon={LayoutGrid} tone="primary" />
        <ClubStatCard
          label={ct('members.barcodePageStat')}
          value={`${params.page} / ${Math.max(1, Math.ceil(total / params.pageSize))}`}
          icon={Table2}
          tone="neutral"
        />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as ViewTab)}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between print:hidden">
          <TabsList className="h-11 w-full flex-wrap sm:w-auto">
            <TabsTrigger value="barcodes" className="gap-2 px-4">
              <ScanBarcode className="size-4" />
              {ct('members.barcodeTabCards')}
            </TabsTrigger>
            <TabsTrigger value="membership" className="gap-2 px-4">
              <IdCard className="size-4" />
              {ct('members.cardsTitle')}
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-2 px-4">
              <Table2 className="size-4" />
              {ct('members.barcodeTabTable')}
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:min-w-[260px]">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={params.search}
                onChange={(e) => setParams({ search: e.target.value, page: 1 })}
                placeholder={ct('members.barcodePlaceholder')}
                className="ps-9"
              />
            </div>
            <Button type="button" variant="brand" disabled={!members.length} onClick={printAction}>
              <Printer className="size-4" />
              {printLabel}
            </Button>
          </div>
        </div>

        <TabsContent value="barcodes" className="space-y-4">
          {isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <BarcodeCardSkeleton key={i} />
              ))}
            </div>
          ) : members.length === 0 ? (
            <EmptyState title={ct('members.emptyMembers')} compact />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {members.map((member) => (
                <MemberBarcodeCard
                  key={member.id}
                  member={member}
                  branch={branchName(member.branchId)}
                  printLabel={ct('common.print')}
                  onPrint={() => setPrintMember(member)}
                />
              ))}
            </div>
          )}

          {!isLoading && !isError && total > 0 && (
            <Pagination
              page={params.page}
              pageSize={params.pageSize}
              total={total}
              onPageChange={(page) => setParams({ page })}
              onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            />
          )}
        </TabsContent>

        <TabsContent value="membership" className="space-y-4">
          {isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <MembershipCardSkeleton key={i} />
              ))}
            </div>
          ) : members.length === 0 ? (
            <EmptyState title={ct('common.noData')} compact />
          ) : (
            <div id="membership-cards-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {members.map((member) => (
                <MembershipCard key={member.id} member={member} />
              ))}
            </div>
          )}

          {!isLoading && !isError && total > 0 && (
            <div className="print:hidden">
              <Pagination
                page={params.page}
                pageSize={params.pageSize}
                total={total}
                onPageChange={(page) => setParams({ page })}
                onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="table" className={cn(view === 'table' && 'mt-0')}>
          <DataTable
            columns={columns}
            data={members}
            total={total}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page) => setParams({ page })}
            onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ct('members.emptyMembers')}
            enableExport
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!printMember} onOpenChange={(o) => !o && setPrintMember(null)}>
        <DialogContent size="md" className="print:max-w-none" aria-describedby={undefined}>
          <DialogHeader className="print:hidden">
            <DialogTitle>{ct('members.printBarcode')}</DialogTitle>
          </DialogHeader>
          {printMember && (
            <div className="flex flex-col items-center gap-4">
              <BarcodeLabel
                code={printMember.memberCode}
                name={printMember.name}
                branch={branchName(printMember.branchId)}
              />
              <Button variant="brand" onClick={() => printBarcodeLabels([toLabel(printMember)])}>
                <Printer className="size-4" /> {ct('common.print')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
