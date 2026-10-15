import { formatDisplayNumber } from '@/lib/number-display';
import { useLocale } from '@/store/locale';
import { MemberQrCard } from '@/components/club/member-qr-card';
import { Copy, CreditCard, IdCard, LayoutGrid, Printer, QrCode, ScanBarcode, Search, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { EmptyState, ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
import { BarcodeLabel, BarcodePreview, barcodeLabelPng, printBarcodeLabels, isGateQrCredential, type BarcodeLabelData } from '@/components/club/barcode-label';
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
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import { MemberAvatar, memberInitials } from '@/components/club/member-avatar';
import type { ColumnDef } from '@tanstack/react-table';
import { usePermission } from '@/hooks/use-permission';
import { writePngImageToClipboard } from '@/lib/clipboard-image';

type ViewTab = 'qr' | 'barcodes' | 'membership' | 'table';

/**
 * Copies the rendered member label to the clipboard as an image, falling back to a
 * PNG download when the browser refuses image clipboard writes.
 */
async function copyBarcodeImage(
  label: BarcodeLabelData,
  messages: { copied: string; downloaded: string; failed: string },
): Promise<void> {
  const png = barcodeLabelPng(label);
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Image clipboard is not supported');
    }
    await writePngImageToClipboard(png, navigator.clipboard, ClipboardItem);
    toast.success(messages.copied);
  } catch {
    try {
      const blob = await png;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `member-${label.format === 'barcode' ? 'barcode' : 'qr'}-${label.code}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.info(messages.downloaded);
    } catch {
      toast.error(messages.failed);
    }
  }
}

function MemberBarcodeCard({
  member,
  branch,
  onCopy,
  onPrint,
  copyLabel,
  printLabel,
}: {
  member: ClubMemberListItem;
  branch: string | null;
  onCopy?: () => void;
  onPrint?: () => void;
  copyLabel: string;
  printLabel: string;
}) {
  const ct = useClubT();
  const barcodeAvailable = Boolean(member.memberCode);
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

        <div className="rounded-xl border bg-background px-4 py-4 shadow-inner">
          <BarcodePreview format="barcode" code={member.memberCode} scannerCode={member.scannerCode} size={164} unavailableLabel={ct('members.gateQrUnavailable')} />
        </div>

        {member.cardNumber && (
          <p className="text-center text-xs text-muted-foreground">
            <span className="nums">{formatDigits(member.cardNumber)}</span>
          </p>
        )}

        {onCopy || onPrint ? (
          <div className="flex gap-2 opacity-90 transition-opacity group-hover:opacity-100">
            {onCopy ? (
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCopy} disabled={!barcodeAvailable}>
                <Copy className="size-4" />
                {copyLabel}
              </Button>
            ) : null}
            {onPrint ? (
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onPrint} disabled={!barcodeAvailable}>
                <Printer className="size-4" />
                {printLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
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
      <p className="mt-2 text-center text-xs nums">{member.phone ? formatDigits(member.phone) : ''}</p>
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
  const { dir } = useLocale();
  const ct = useClubT();
  const { can } = usePermission();
  const canPrint = can('club.members.barcode_management:print');
  const { params, setParams } = useListQuery();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const view: ViewTab =
    tabParam === 'membership' || tabParam === 'table' || tabParam === 'barcodes' ? tabParam : 'qr';

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
        : view === 'barcodes' ? params
        : { ...params, filters: { ...params.filters, includeGateCredentials: 'true' } },
    [params, view],
  );

  const { data, isLoading, isError, refetch } = usePaginatedList<ClubMemberListItem>('club-members', listParams);
  const { data: branches } = useBranches();
  const [printMember, setPrintMember] = useState<ClubMemberListItem | null>(null);

  const members = data?.data ?? [];
  const total = data?.total ?? 0;
  const isBarcodeView = view === 'barcodes';
  const printableMembers = members.filter((member) => isBarcodeView ? Boolean(member.memberCode) : isGateQrCredential(member.scannerCode));

  const branchName = (id: number) => branches?.find((b) => b.id === id)?.name ?? null;

  const toLabel = (m: ClubMemberListItem): BarcodeLabelData => ({
    format: isBarcodeView ? 'barcode' : 'qr',
    code: m.memberCode,
    scannerCode: m.scannerCode,
    name: m.name,
    branch: branchName(m.branchId),
  });

  const copyMessages = {
    copied: ct(isBarcodeView ? 'members.barcodeCopied' : 'members.qrCopied'),
    downloaded: ct(isBarcodeView ? 'members.barcodeDownloaded' : 'members.qrDownloaded'),
    failed: ct(isBarcodeView ? 'members.barcodeCopyFailed' : 'members.qrCopyFailed'),
  };

  const printBarcodes = () => {
    if (!members.length) return;
    const skipped = members.length - printableMembers.length;
    if (skipped) toast.warning(ct('members.qrPrintSkipped', { count: skipped }));
    printBarcodeLabels(printableMembers.map(toLabel));
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
          <div className="rounded-lg border bg-background px-3 py-2">
            <BarcodePreview code={row.original.memberCode} scannerCode={row.original.scannerCode} size={116} unavailableLabel={ct('members.gateQrUnavailable')} />
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
        cell: ({ row }) => canPrint ? (
          <Button size="sm" variant="outline" disabled={!isGateQrCredential(row.original.scannerCode)} onClick={() => setPrintMember(row.original)}>
            <Printer className="size-4" /> {ct('packages.openView')}
          </Button>
        ) : null,
      },
    ],
    [canPrint, ct],
  );

  const printLabel =
    view === 'membership' ? ct('members.cardsPrintPage') : ct('members.barcodePrintPage');

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title={ct('members.barcodeMgmtTitle')}
        description={view === 'membership' ? ct('members.cardsDesc') : ct(isBarcodeView ? 'members.barcodeMgmtDesc' : 'members.qrCardsDesc')}
        className="print:hidden"
      />

      {view === 'qr' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground print:hidden">
          <p>{ct('members.totalCardsMembers')} <span className="ms-2 font-semibold tabular-nums text-foreground">{formatDisplayNumber(total)}</span></p>
          <p>{ct('members.barcodePageStat')} <span className="ms-2 tabular-nums" dir="ltr">{formatDisplayNumber(params.page)} / {formatDisplayNumber(Math.max(1, Math.ceil(total / params.pageSize)))}</span></p>
        </div>
      ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <ClubStatCard label={ct('members.totalCardsMembers')} value={total} icon={QrCode} tone="members" />
        <ClubStatCard label={ct('members.barcodeTabCards')} value={members.length} icon={LayoutGrid} tone="primary" />
        <ClubStatCard
          label={ct('members.barcodePageStat')}
          value={`${params.page} / ${Math.max(1, Math.ceil(total / params.pageSize))}`}
          icon={Table2}
          tone="neutral"
        />
      </div>
      )}

      <Tabs dir={dir} value={view} onValueChange={(v) => setView(v as ViewTab)}>
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between print:hidden">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:flex-wrap">
            <TabsTrigger value="qr" className="min-h-11 gap-2 px-4">
              <QrCode className="size-4" />
              {ct('members.qrTab')}
            </TabsTrigger>
            <TabsTrigger value="barcodes" className="min-h-11 gap-2 px-4">
              <ScanBarcode className="size-4" />
              {ct('members.barcodeTabCards')}
            </TabsTrigger>
            <TabsTrigger value="membership" className="min-h-11 gap-2 px-4">
              <IdCard className="size-4" />
              {ct('members.cardsTitle')}
            </TabsTrigger>
            <TabsTrigger value="table" className="min-h-11 gap-2 px-4">
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
                aria-label={ct('members.barcodePlaceholder')}
                placeholder={ct('members.barcodePlaceholder')}
                className="ps-9"
              />
            </div>
            {canPrint ? <Button type="button" variant="brand" disabled={isLoading || isError || !(view === 'membership' ? members.length : printableMembers.length)} onClick={printAction}>
              <Printer className="size-4" />
              {printLabel}
            </Button> : null}
          </div>
        </div>

        <TabsContent value="qr" className="space-y-4">
          {isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-5 rounded-2xl border bg-card p-6"><Skeleton className="mx-auto h-6 w-2/3" /><Skeleton className="mx-auto size-52" /><Skeleton className="h-11 w-full" /></div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <EmptyState title={ct('members.emptyMembers')} compact />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {members.map((member) => (
                <MemberQrCard
                  key={member.id}
                  member={member}
                  branch={branchName(member.branchId)}
                  onCopy={() => void copyBarcodeImage({ ...toLabel(member), format: 'qr' }, {
                    copied: ct('members.qrCopied'), downloaded: ct('members.qrDownloaded'), failed: ct('members.qrCopyFailed'),
                  })}
                  onPrint={canPrint ? () => setPrintMember(member) : undefined}
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
                  copyLabel={ct('packages.copyBarcode')}
                  printLabel={ct('packages.viewPrintBarcode')}
                  onCopy={() => void copyBarcodeImage(toLabel(member), copyMessages)}
                  onPrint={canPrint ? () => setPrintMember(member) : undefined}
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
            exportSource={{ resource: 'club-members', params: listParams }}
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

      <Dialog open={canPrint && !!printMember} onOpenChange={(o) => !o && setPrintMember(null)}>
        <DialogContent size="md" className="print:max-w-none" aria-describedby={undefined}>
          <DialogHeader className="print:hidden">
            <DialogTitle>{ct(isBarcodeView ? 'members.barcodePreviewTitle' : 'packages.openView')}</DialogTitle>
          </DialogHeader>
          {printMember && (
            <div className="flex flex-col items-center gap-4">
              <BarcodeLabel
                format={isBarcodeView ? 'barcode' : 'qr'}
                code={printMember.memberCode}
                scannerCode={printMember.scannerCode}
                unavailableLabel={ct('members.gateQrUnavailable')}
                name={printMember.name}
                branch={branchName(printMember.branchId)}
              />
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button className="flex-1" variant="brand" disabled={!isBarcodeView && !isGateQrCredential(printMember.scannerCode)} onClick={() => printBarcodeLabels([toLabel(printMember)])}>
                  <Printer className="size-4" /> {ct('common.print')}
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={!isBarcodeView && !isGateQrCredential(printMember.scannerCode)}
                  onClick={() => void copyBarcodeImage(toLabel(printMember), copyMessages)}
                >
                  <Copy className="size-4" /> {ct(isBarcodeView ? 'members.copyBarcodeImage' : 'members.copyQrImage')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
