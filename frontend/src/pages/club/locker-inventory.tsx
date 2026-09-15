import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, Download, Eye, FileCheck2, LockKeyhole, Plus, Printer, Save, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { localToday } from '@/lib/formatters';
import { lockerInventoryCsv, normalizeTask8Tab } from '../task8-workspace-model';
import { ClubLockersPage } from './lockers';

type LockerTab = 'operations' | 'draft' | 'finalized' | 'review';
type SessionStatus = 'draft' | 'finalized' | 'approved' | 'rejected';
type Session = { id: number; branch_id: number; inventory_date: string; status: SessionStatus; notes?: string | null; created_at?: string; finalized_at?: string | null; reviewed_at?: string | null };
type Line = { id: number; locker_id: number; lockerNumber: string; expected_status: string; actual_status: string; notes?: string | null; hasDifference: boolean };
type SessionDetail = Session & { lines: Line[]; totals: { counted: number; differences: number } };
type Locker = { id: number; locker_number?: string; lockerNumber?: string; main_branch_id?: number; mainBranchId?: number; sub_branch_id?: number; subBranchId?: number; is_available?: boolean; isAvailable?: boolean };

const tabs = ['operations', 'draft', 'finalized', 'review'] as const;
const selectCls = 'flex h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm';
const statusLabels: Record<SessionStatus, string> = { draft: 'مسودة', finalized: 'منتهٍ بانتظار المراجعة', approved: 'معتمد', rejected: 'مرفوض' };
const lockerStatusLabels: Record<string, string> = { available: 'متاح', occupied: 'مشغول', damaged: 'تالف', unavailable: 'غير متاح' };

export function LockerInventoryPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = requested === 'inventory' ? 'draft' : requested === 'inventory-review' ? 'review' : normalizeTask8Tab(requested, tabs, 'operations');
  const { data: branches = [] } = useBranches();
  const { data: lockers = [] } = useArrayResource<Locker>('club-lockers', tab !== 'operations');
  const [branchId, setBranchId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftForm, setDraftForm] = useState({ branchId: '', inventoryDate: localToday(), notes: '' });
  const [lineForm, setLineForm] = useState({ lockerId: '', actualStatus: 'available', notes: '' });

  const sessionQuery = useQuery({
    queryKey: ['club-lockers/inventory', tab, branchId],
    queryFn: async ({ signal }) => (await api.get<Session[]>('/club-lockers/inventory', { signal, params: { branchId: branchId ? Number(branchId) : undefined, status: tab === 'draft' ? 'draft' : tab === 'finalized' ? 'finalized' : undefined } })).data,
    enabled: tab !== 'operations',
  });
  const detailQuery = useQuery({ queryKey: ['club-lockers/inventory/detail', selectedId], queryFn: async ({ signal }) => (await api.get<SessionDetail>(`/club-lockers/inventory/${selectedId}`, { signal })).data, enabled: selectedId != null });

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['club-lockers/inventory'] }); if (selectedId) void qc.invalidateQueries({ queryKey: ['club-lockers/inventory/detail', selectedId] }); };
  const createMutation = useMutation({ mutationFn: () => api.post('/club-lockers/inventory/drafts', { branchId: Number(draftForm.branchId), inventoryDate: draftForm.inventoryDate, notes: draftForm.notes || undefined }), onSuccess: (response) => { toast.success('تم إنشاء مسودة الجرد'); setCreateOpen(false); refresh(); setSelectedId(response.data.id); }, onError: (error) => toast.error(apiError(error)) });
  const lineMutation = useMutation({ mutationFn: () => api.patch(`/club-lockers/inventory/${selectedId}/lines`, { lockerId: Number(lineForm.lockerId), actualStatus: lineForm.actualStatus, notes: lineForm.notes || undefined }), onSuccess: () => { toast.success('تم حفظ حالة اللوكر'); setLineForm({ lockerId: '', actualStatus: 'available', notes: '' }); refresh(); }, onError: (error) => toast.error(apiError(error)) });
  const finalizeMutation = useMutation({ mutationFn: () => api.patch(`/club-lockers/inventory/${selectedId}/finalize`), onSuccess: () => { toast.success('تم إنهاء الجرد وإرساله للمراجعة'); refresh(); }, onError: (error) => toast.error(apiError(error)) });
  const reviewMutation = useMutation({ mutationFn: (action: 'approve' | 'reject') => api.patch(`/club-lockers/inventory/${selectedId}/review`, { action }), onSuccess: (_, action) => { toast.success(action === 'approve' ? 'تم اعتماد الجرد' : 'تم رفض الجرد'); refresh(); }, onError: (error) => toast.error(apiError(error)) });
  const changeTab = (value: string) => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); setSelectedId(null); };
  const visibleSessions = (sessionQuery.data ?? []).filter((session) => tab !== 'review' || session.status !== 'draft');
  const activeBranch = detailQuery.data?.branch_id;
  const availableLockers = lockers.filter((locker) => !activeBranch || [locker.main_branch_id, locker.mainBranchId, locker.sub_branch_id, locker.subBranchId].includes(activeBranch));
  const exportDetail = () => {
    const detail = detailQuery.data;
    if (!detail) return;
    const csv = lockerInventoryCsv({
      id: detail.id,
      inventoryDate: detail.inventory_date,
      status: statusLabels[detail.status],
      lines: detail.lines.map((line) => ({
        lockerNumber: line.lockerNumber,
        expectedStatus: lockerStatusLabels[line.expected_status] ?? line.expected_status,
        actualStatus: lockerStatusLabels[line.actual_status] ?? line.actual_status,
        result: line.hasDifference ? 'يوجد فرق' : 'مطابق',
        notes: line.notes,
      })),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `locker-inventory-${detail.id}-${detail.inventory_date}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <main className="space-y-5" dir="rtl">
    <PageHeader title="إدارة اللوكر والجرد" description="تشغيل اشتراكات اللوكر، جرد فعلي بمرحلة مسودة، ومراجعة مستقلة تحفظ الفروق والأثر." />
    <Tabs value={tab} onValueChange={changeTab}>
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-fit" aria-label="أقسام اللوكر والجرد"><TabsTrigger value="operations" className="min-h-11 gap-2"><LockKeyhole />الاشتراكات واللوكرات</TabsTrigger><TabsTrigger value="draft" className="min-h-11 gap-2"><ClipboardList />مسودات الجرد</TabsTrigger><TabsTrigger value="finalized" className="min-h-11 gap-2"><FileCheck2 />الجرد المنتهى</TabsTrigger><TabsTrigger value="review" className="min-h-11 gap-2"><Eye />المراجعة والاعتماد</TabsTrigger></TabsList>
      <TabsContent value="operations" className="mt-5"><ClubLockersPage /></TabsContent>
      {(['draft', 'finalized', 'review'] as LockerTab[]).map((value) => <TabsContent key={value} value={value} className="mt-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div className="w-full sm:max-w-xs"><Label htmlFor={`locker-inventory-branch-${value}`}>الفرع</Label><select id={`locker-inventory-branch-${value}`} className={selectCls} value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">الفروع المسموحة</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>{value === 'draft' ? <Button variant="brand" onClick={() => { setDraftForm({ branchId: branchId || (branches[0]?.id ? String(branches[0].id) : ''), inventoryDate: localToday(), notes: '' }); setCreateOpen(true); }}><Plus />مسودة جرد جديدة</Button> : null}</div>
        <SessionList loading={sessionQuery.isLoading} error={sessionQuery.isError} rows={visibleSessions} onRetry={() => void sessionQuery.refetch()} onSelect={setSelectedId} />
      </TabsContent>)}
    </Tabs>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>مسودة جرد لوكر جديدة</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="locker-draft-branch">الفرع</Label><select id="locker-draft-branch" className={selectCls} value={draftForm.branchId} onChange={(event) => setDraftForm((form) => ({ ...form, branchId: event.target.value }))}><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div><div><Label htmlFor="locker-draft-date">تاريخ الجرد</Label><Input id="locker-draft-date" type="date" value={draftForm.inventoryDate} onChange={(event) => setDraftForm((form) => ({ ...form, inventoryDate: event.target.value }))} /></div></div><div><Label htmlFor="locker-draft-notes">ملاحظات البداية</Label><Textarea id="locker-draft-notes" className="text-base sm:text-sm" value={draftForm.notes} onChange={(event) => setDraftForm((form) => ({ ...form, notes: event.target.value }))} /></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !draftForm.branchId || !draftForm.inventoryDate}><Save />{createMutation.isPending ? 'جارٍ الإنشاء…' : 'إنشاء المسودة'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={selectedId != null} onOpenChange={(open) => !open && setSelectedId(null)}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}><DialogHeader><DialogTitle>جلسة جرد اللوكر</DialogTitle></DialogHeader>{detailQuery.isLoading ? <PageSkeleton /> : detailQuery.isError ? <ErrorState onRetry={() => void detailQuery.refetch()} /> : detailQuery.data ? <div id="locker-inventory-report" className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3"><Stat label="الحالة" value={statusLabels[detailQuery.data.status]} /><Stat label="اللوكرات المعدودة" value={String(detailQuery.data.totals.counted)} /><Stat label="الفروق" value={String(detailQuery.data.totals.differences)} emphasis={detailQuery.data.totals.differences > 0} /></section>
      <div className="no-print flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={exportDetail} disabled={!detailQuery.data.lines.length}><Download />تصدير CSV</Button><Button type="button" variant="outline" onClick={() => window.print()}><Printer />طباعة تقرير الجرد</Button></div>
      {detailQuery.data.status === 'draft' ? <section className="rounded-xl border p-4"><h3 className="font-semibold">إدخال حالة لوكر</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><Label htmlFor="inventory-locker">اللوكر</Label><select id="inventory-locker" className={selectCls} value={lineForm.lockerId} onChange={(event) => setLineForm((form) => ({ ...form, lockerId: event.target.value }))}><option value="">اختر اللوكر</option>{availableLockers.map((locker) => <option key={locker.id} value={locker.id}>{locker.locker_number ?? locker.lockerNumber ?? `لوكر ${locker.id}`}</option>)}</select></div><div><Label htmlFor="inventory-status">الحالة الفعلية</Label><select id="inventory-status" className={selectCls} value={lineForm.actualStatus} onChange={(event) => setLineForm((form) => ({ ...form, actualStatus: event.target.value }))}>{Object.entries(lockerStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div><Label htmlFor="inventory-note">ملاحظة</Label><Input id="inventory-note" value={lineForm.notes} onChange={(event) => setLineForm((form) => ({ ...form, notes: event.target.value }))} /></div></div><Button className="mt-3" onClick={() => lineMutation.mutate()} disabled={lineMutation.isPending || !lineForm.lockerId}><Save />{lineMutation.isPending ? 'جارٍ الحفظ…' : 'حفظ الحالة'}</Button></section> : null}
      {!detailQuery.data.lines.length ? <EmptyState compact title="لم يتم إدخال أي لوكر" /> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[640px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">اللوكر</th><th className="p-3 text-start">المتوقع</th><th className="p-3 text-start">الفعلي</th><th className="p-3 text-start">النتيجة</th><th className="p-3 text-start">الملاحظة</th></tr></thead><tbody>{detailQuery.data.lines.map((line) => <tr key={line.id} className="border-t"><td className="p-3 font-medium">{line.lockerNumber}</td><td className="p-3">{lockerStatusLabels[line.expected_status] ?? line.expected_status}</td><td className="p-3">{lockerStatusLabels[line.actual_status] ?? line.actual_status}</td><td className="p-3"><span className={line.hasDifference ? 'font-medium text-destructive' : 'text-emerald-700 dark:text-emerald-300'}>{line.hasDifference ? 'يوجد فرق' : 'مطابق'}</span></td><td className="max-w-xs break-words p-3 text-muted-foreground">{line.notes || '—'}</td></tr>)}</tbody></table></div>}
      <DialogFooter>{detailQuery.data.status === 'draft' ? <Button onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending || !detailQuery.data.lines.length}><FileCheck2 />إنهاء وإرسال للمراجعة</Button> : null}{detailQuery.data.status === 'finalized' ? <><Button variant="destructive" permissionResource="club.lockers" permissionAction="approve" onClick={() => reviewMutation.mutate('reject')} disabled={reviewMutation.isPending}><X />رفض</Button><Button permissionResource="club.lockers" permissionAction="approve" onClick={() => reviewMutation.mutate('approve')} disabled={reviewMutation.isPending}><Check />اعتماد</Button></> : null}</DialogFooter>
    </div> : null}</DialogContent></Dialog>
  </main>;
}

function SessionList({ loading, error, rows, onRetry, onSelect }: { loading: boolean; error: boolean; rows: Session[]; onRetry: () => void; onSelect: (id: number) => void }) {
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState onRetry={onRetry} />;
  if (!rows.length) return <EmptyState title="لا توجد جلسات جرد في هذه المرحلة" />;
  return <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[680px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">رقم الجلسة</th><th className="p-3 text-start">الفرع</th><th className="p-3 text-start">التاريخ</th><th className="p-3 text-start">الحالة</th><th className="p-3 text-start">الملاحظات</th><th className="p-3 text-start">التفاصيل</th></tr></thead><tbody>{rows.map((session) => <tr key={session.id} className="border-t"><td className="p-3 font-medium tabular-nums">#{session.id}</td><td className="p-3 tabular-nums">{session.branch_id}</td><td className="p-3 tabular-nums">{session.inventory_date}</td><td className="p-3"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{statusLabels[session.status]}</span></td><td className="max-w-sm break-words p-3 text-muted-foreground">{session.notes || '—'}</td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => onSelect(session.id)}><Eye />فتح</Button></td></tr>)}</tbody></table></div>;
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) { return <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={emphasis ? 'mt-1 font-semibold text-destructive' : 'mt-1 font-semibold'}>{value}</p></div>; }
