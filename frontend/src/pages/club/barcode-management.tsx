import { Copy, CreditCard, IdCard, LayoutGrid, Printer, ScanBarcode, Search, Table2 } from 'lucide-react';
import { printedPhone } from '@/lib/phone-mask';
import { useEffect, useMemo, useState } from 'react';
import { normalizeScannedCode } from '@/components/club/club-member-search';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { EmptyState, ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
import { BarcodeLabel, BarcodePreview, barcodeLabelPng, printBarcodeLabels, type BarcodeLabelData } from '@/components/club/barcode-label';
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
import { api, apiError } from '@/lib/api';
import { writePngImageToClipboard } from '@/lib/clipboard-image';
import { CLUB_ROUTES } from '@/lib/club-routes';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import { MemberAvatar, memberInitials } from '@/components/club/member-avatar';
import { MemberGenderSelect, useMemberGenderFilter } from '@/components/club/member-gender-filter';
import type { ColumnDef } from '@tanstack/react-table';
import { FitnessSpaAttendanceReportPanel } from './fitness/spa-attendance';
import { FitnessClassAttendanceReportPanel } from './fitness/class-attendance';

type ViewTab = 'barcodes' | 'membership' | 'table' | 'print-range' | 'spa-attendance' | 'class-attendance';

/** Old check-in tabs of this page, now tabs of the حضور page. */
const CHECK_IN_TABS: Record<string, string> = { 'member-check-in': 'members', spa: 'spa', classes: 'classes' };

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
      link.download = `member-barcode-${label.code}.png`;
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
  onCopy: () => void;
  onPrint: () => void;
  copyLabel: string;
  printLabel: string;
}) {
  const ct = useClubT();
  const accent = member.gender === 'female' ? '#EC4899' : '#D3121A';

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

        <div className="flex gap-2 opacity-90 transition-opacity group-hover:opacity-100">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCopy}>
            <Copy className="size-4" />
            {copyLabel}
          </Button>
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onPrint}>
            <Printer className="size-4" />
            {printLabel}
          </Button>
        </div>
      </div>
    </article>
  );
}

function MembershipCard({ member }: { member: ClubMemberListItem }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm print:break-inside-avoid">
      <div className="flex items-center gap-2 text-primary">
        <CreditCard className="size-5" />
        <span className="text-xs font-bold uppercase tracking-wider">Noamany Fitness Center</span>
      </div>
      <MemberAvatar name={member.name} profilePicture={member.profilePicture} size="lg" className="mx-auto mt-3 ring-2 ring-primary/20" />
      <p className="mt-3 text-center text-lg font-bold">{member.name}</p>
      <p className="text-center font-mono text-sm nums text-muted-foreground">{member.memberCode}</p>
      <p className="mt-1 text-center text-xs text-muted-foreground">{member.membershipType?.name ?? '—'}</p>
      {/* Printed card: the number is printed masked (phone privacy). */}
      <p className="mt-2 text-center text-xs nums" dir="ltr">{member.phone ? printedPhone(member.phone) : ''}</p>
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
  const [searchDraft, setSearchDraft] = useState(params.search ?? '');
  const commitSearch = (value: string) => {
    const next = normalizeScannedCode(value);
    if (next !== value.trim()) setSearchDraft(next); // only rewrite a scanned code, never a name being typed
    if (next !== (params.search ?? '')) setParams({ search: next, page: 1 });
  };
  useEffect(() => {
    const id = window.setTimeout(() => commitSearch(searchDraft), 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabParam =
    pathname.endsWith('/print-range') ? 'print-range'
      : pathname.endsWith('/spa-attendance') ? 'spa-attendance'
      : pathname.endsWith('/classes-attendance') ? 'class-attendance'
      : searchParams.get('tab');
  const view: ViewTab =
    tabParam === 'membership' || tabParam === 'table' || tabParam === 'print-range' || tabParam === 'spa-attendance' || tabParam === 'class-attendance' || tabParam === 'barcodes' ? tabParam : 'barcodes';

  const setView = (next: ViewTab) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', next);
    p.set('page', '1');
    navigate({ pathname: '/club/members/barcode-management', search: `?${p.toString()}` }, { replace: true });
  };

  // رجالي/حريمي/الكل (locked to the employee's own section).
  const gender = useMemberGenderFilter();
  const printCardParams = useMemo(() => ({ ...params, filters: { ...params.filters, gender: gender.value } }), [params, gender.value]);
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubMemberListItem>('club-members/print-cards', printCardParams, ['barcodes', 'membership', 'table', 'print-range'].includes(view));
  const { data: branches } = useBranches();
  const [printMember, setPrintMember] = useState<ClubMemberListItem | null>(null);
  const [codeFrom, setCodeFrom] = useState('');
  const [codeTo, setCodeTo] = useState('');
  const [isPrintingRange, setIsPrintingRange] = useState(false);

  const members = data?.data ?? [];
  const total = data?.total ?? 0;

  const branchName = (id: number) => branches?.find((b) => b.id === id)?.name ?? null;

  const toLabel = (m: ClubMemberListItem): BarcodeLabelData => ({
    code: m.memberCode,
    name: m.name,
    branch: branchName(m.branchId),
  });

  const copyMessages = {
    copied: ct('members.barcodeCopied'),
    downloaded: ct('members.barcodeDownloaded'),
    failed: ct('members.barcodeCopyFailed'),
  };

  const printBarcodes = () => {
    if (!members.length) return;
    printBarcodeLabels(members.map(toLabel));
  };

  const printBarcodeRange = async () => {
    if (!codeFrom.trim() || !codeTo.trim()) {
      toast.error('أدخل كود البداية وكود النهاية للطباعة');
      return;
    }
    setIsPrintingRange(true);
    try {
      const { data: result } = await api.get<{ data: ClubMemberListItem[]; capped: boolean }>('/club-members/barcode-range', {
        params: { codeFrom: codeFrom.trim(), codeTo: codeTo.trim(), gender: gender.param },
      });
      if (!result.data.length) {
        toast.error('لا يوجد أعضاء ضمن نطاق الأكواد المحدد');
        return;
      }
      printBarcodeLabels(result.data.map(toLabel));
      if (result.capped) toast.message('تمت طباعة أول 500 كود فقط؛ قسّم النطاق للطباعة التالية.');
    } catch (error) {
      toast.error(apiError(error, 'تعذرت طباعة نطاق الباركود'));
    } finally {
      setIsPrintingRange(false);
    }
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

  const checkInTab = tabParam ? CHECK_IN_TABS[tabParam] : undefined;
  if (checkInTab) return <Navigate to={`${CLUB_ROUTES.members.checkIn}?tab=${checkInTab}`} replace />;

  const printLabel =
    view === 'membership' ? ct('members.cardsPrintPage') : ct('members.barcodePrintPage');

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title={ct('members.barcodeMgmtTitle')}
        description={view === 'membership' ? ct('members.cardsDesc') : ct('members.barcodeMgmtDesc')}
        className="print:hidden"
      />

      {['barcodes', 'membership', 'table'].includes(view) && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <ClubStatCard label={ct('members.name')} value={total} icon={ScanBarcode} tone="members" />
        <ClubStatCard label={ct('members.barcodeTabCards')} value={members.length} icon={LayoutGrid} tone="primary" />
        <ClubStatCard label={ct('members.barcodePageStat')} value={`${params.page} / ${Math.max(1, Math.ceil(total / params.pageSize))}`} icon={Table2} tone="neutral" />
      </div>}

      <Tabs value={view} onValueChange={(v) => setView(v as ViewTab)}>
        <div className="flex flex-col gap-4 print:hidden">
          <TabsList className="h-11 w-full flex-wrap">
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

          {['barcodes', 'membership', 'table'].includes(view) && <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:min-w-[260px]">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              {/* Typed locally and written to the URL after a pause: a scanner types the whole code in a
                  few milliseconds, and updating the URL on every key kept only the last digit («0»). */}
              <Input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitSearch(searchDraft);
                  }
                }}
                placeholder={ct('members.barcodePlaceholder')}
                className="ps-9"
              />
            </div>
            <MemberGenderSelect
              hideLabel
              value={gender.value}
              locked={gender.locked}
              onChange={(value) => {
                gender.setValue(value);
                setParams({ page: 1 });
              }}
            />
            <Button type="button" variant="brand" disabled={!members.length} onClick={printAction}>
              <Printer className="size-4" />
              {printLabel}
            </Button>
          </div>}
        </div>

        <TabsContent value="print-range" className="mx-auto max-w-3xl space-y-4">
          <section className="grid gap-3 rounded-xl border bg-card p-5 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <div><label className="mb-1.5 block text-sm font-medium">من كود</label><Input autoFocus value={codeFrom} onChange={(e) => setCodeFrom(e.target.value)} placeholder="مثال: A000001" className="font-mono nums" /></div>
            <div><label className="mb-1.5 block text-sm font-medium">إلى كود</label><Input value={codeTo} onChange={(e) => setCodeTo(e.target.value)} placeholder="مثال: A000008" className="font-mono nums" /></div>
            <MemberGenderSelect value={gender.value} onChange={gender.setValue} locked={gender.locked} />
            <Button type="button" variant="brand" onClick={() => void printBarcodeRange()} disabled={isPrintingRange}><Printer className="size-4" /> {isPrintingRange ? 'جارٍ التجهيز…' : 'طباعة النطاق'}</Button>
          </section>
          <p className="text-center text-sm text-muted-foreground">تُطبع الأكواد الواقعة بين كود البداية وكود النهاية فقط.</p>
        </TabsContent>

        <TabsContent value="spa-attendance"><FitnessSpaAttendanceReportPanel /></TabsContent>
        <TabsContent value="class-attendance"><FitnessClassAttendanceReportPanel /></TabsContent>

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
                  copyLabel={ct('members.copy')}
                  printLabel={ct('common.print')}
                  onCopy={() => void copyBarcodeImage(toLabel(member), copyMessages)}
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
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button className="flex-1" variant="brand" onClick={() => printBarcodeLabels([toLabel(printMember)])}>
                  <Printer className="size-4" /> {ct('common.print')}
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => void copyBarcodeImage(toLabel(printMember), copyMessages)}>
                  <Copy className="size-4" /> {ct('members.copyBarcodeImage')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
