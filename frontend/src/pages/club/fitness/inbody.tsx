import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileText, Loader2, Plus, Ruler, Settings2, Upload, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { usePermission } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { api, apiError } from '@/lib/api';
import { useFileUpload, uploadUrl } from '@/components/employees/use-uploads';
import { localToday } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { MemberGenderSelect, useMemberGenderFilter } from '@/components/club/member-gender-filter';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { InbodyMeasurementRow, InbodyMemberContext } from '@/types/fitness';
import type { ClubMemberListItem } from '@/types/club';
import { RowActions, SELECT_CLS } from './shared';
import { InbodyMemberDetailDialog } from './inbody-member-detail-dialog';
import { InbodySettingsTab } from './inbody-settings-tab';

const PAYMENT_METHODS: Array<[string, string]> = [['cash', 'نقدي'], ['card', 'فيزا / بطاقة'], ['wallet', 'محفظة'], ['transfer', 'تحويل']];

export function FitnessInbodyPage() {
  const ft = useFitnessT();
  const { user } = useAuth();
  const { ui } = useLocale();
  const { superAdmin, can } = usePermission();
  const canManageSettings = can('club.members.measurements:update');
  const [tab, setTab] = useState('measurements');
  // Balance / auto-charge (Gymora way): loaded when a member is picked for a new measurement.
  const [context, setContext] = useState<InbodyMemberContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [settle, setSettle] = useState<'balance' | 'paid'>('balance');
  const [offerId, setOfferId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const title = user?.job_title?.normalize('NFKD') ?? '';
  const todayOnly = !superAdmin && user?.level !== 3 && /(استقبال|ريسيبشن|ريسبشن|reception)/i.test(title) && !/(مدير|مشرف|رئيس|manager|supervisor|head)/i.test(title);
  const { params, setParams } = useListQuery();
  // رجالي/حريمي/الكل (locked to the employee's own section).
  const gender = useMemberGenderFilter();
  const { data, isLoading, isError, refetch } = usePaginatedList<InbodyMeasurementRow>(
    'club-inbody-measurements',
    { ...params, filters: { ...params.filters, gender: gender.value } },
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const { data: nextFileNumber } = useQuery({
    queryKey: ['club-inbody-measurements', 'next-file-number'],
    enabled: open && editId == null,
    queryFn: async () => (await api.get<{ nextFileNumber: number }>('/club-inbody-measurements/next-file-number')).data.nextFileNumber,
  });
  const { upload, uploading } = useFileUpload();
  const [form, setForm] = useState({
    memberCode: '',
    measurementDate: localToday(),
    reportUrl: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-inbody-measurements/${id}`),
    { success: ft('common.success'), invalidate: ['club-inbody-measurements'] },
  );

  const loadContext = async (member: ClubMemberListItem) => {
    setContext(null);
    setOfferId('');
    setSettle('balance');
    setPaymentMethod('cash');
    setLoadingContext(true);
    try {
      const { data: ctx } = await api.get<InbodyMemberContext>('/club-inbody-measurements/member-benefits/by-code', {
        params: { memberCode: member.memberCode },
      });
      setContext(ctx);
      if (ctx.totalRemaining === 0 && ctx.offers[0]) setOfferId(String(ctx.offers[0].id));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setLoadingContext(false);
    }
  };

  const hasBalance = Boolean(context && context.totalRemaining > 0);
  const requiresPayment = Boolean(context && (context.totalRemaining === 0 || settle === 'paid'));
  const selectedOffer = context?.offers.find((offer) => String(offer.id) === offerId);
  const saleBlocked = Boolean(requiresPayment && context && !context.hasActiveMembership && !context.allowWithoutActiveMembership);
  const chooseSettle = (next: 'balance' | 'paid') => {
    setSettle(next);
    setOfferId(next === 'paid' && context?.offers[0] ? String(context.offers[0].id) : '');
  };

  const openCreate = () => {
    setEditId(null);
    setSelectedMember(null);
    setContext(null);
    setOfferId('');
    setSettle('balance');
    setForm({
      memberCode: '',
      measurementDate: localToday(),
      reportUrl: '',
    });
    setOpen(true);
  };

  const openEdit = async (row: InbodyMeasurementRow) => {
    const { data: member } = await api.get<ClubMemberListItem>(`/club-members/measurement-operation-member/${row.memberId}`);
    setSelectedMember(member);
    setEditId(row.id);
    setForm({
      memberCode: row.memberCode ?? String(row.memberId),
      measurementDate: row.measurementDate,
      reportUrl: row.reportUrl ?? '',
    });
    setOpen(true);
  };

  const onPickReport = async (file: File | undefined) => {
    if (!file) return;
    const path = await upload('inbody', file);
    if (path) setForm((f) => ({ ...f, reportUrl: path }));
  };

  const save = async () => {
    if (!selectedMember || !form.measurementDate || !form.reportUrl) {
      toast.error(!selectedMember ? ft('inbody.selectMemberFirst') : !form.reportUrl ? ft('inbody.uploadFileFirst') : ft('inbody.measurementDateRequired'));
      return;
    }
    if (!editId && !context) {
      toast.error(ui('جارٍ فحص رصيد InBody…'));
      return;
    }
    if (!editId && requiresPayment && !offerId) {
      toast.error(ui('اختر سعر القياس أو الباقة'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberId: selectedMember.id,
        measurementDate: form.measurementDate,
        reportUrl: form.reportUrl,
      };
      if (editId) {
        await api.put(`/club-inbody-measurements/${editId}`, payload);
        toast.success(ft('common.success'));
      } else {
        await api.post('/club-inbody-measurements/record', {
          ...payload,
          branchId: context!.member.branchId,
          ...(requiresPayment ? { settle: 'paid', offerId: Number(offerId), paymentMethod } : {}),
        });
        toast.success(requiresPayment ? ui('تم تسجيل القياس والتحصيل في الإيرادات') : ui('تم تسجيل القياس وخصمه من الرصيد'));
      }
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const [profileMemberId, setProfileMemberId] = useState<number | null>(null);

  const columns = useMemo<ColumnDef<InbodyMeasurementRow>[]>(
    () => [
      {
        accessorKey: 'memberCode',
        header: ft('common.memberCode'),
        cell: ({ getValue }) => <span className="font-mono" dir="ltr">{String(getValue() ?? '—')}</span>,
      },
      {
        accessorKey: 'memberName',
        header: ft('common.member'),
        cell: ({ getValue }) => <span className="font-medium">{String(getValue() ?? '—')}</span>,
      },
      {
        accessorKey: 'measurementDate',
        header: ft('common.date'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'reportUrl',
        header: ft('inbody.details'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null | undefined;
          const href = uploadUrl(v);
          return href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              title={ft('inbody.viewFile')}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              <FileText className="size-4" /> {ft('inbody.fileLabel')}
            </a>
          ) : (
            '—'
          );
        },
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {/* Every InBody measurement and file this member has, newest first. */}
            <Button
              variant="ghost"
              size="icon"
              title={ft('inbody.viewDetails')}
              aria-label={ft('inbody.viewDetails')}
              onClick={() => setProfileMemberId(row.original.memberId)}
            >
              <Eye className="size-4" />
            </Button>
            <RowActions
              editLabel={ft('common.edit')}
              deleteLabel={ft('common.delete')}
              onEdit={() => void openEdit(row.original)}
              onDelete={() =>
                void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                  if (ok) deleteMutation.mutate(row.original.id);
                })
              }
            />
          </div>
        ),
      },
    ],
    [ft, deleteMutation],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('inbody.memberMeasurementsTitle')}
        description={ft('inbody.memberMeasurementsDescription')}
        actions={tab === 'measurements' ? (
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('inbody.addMemberMeasurement')}
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
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        toolbar={<MemberGenderSelect hideLabel value={gender.value} locked={gender.locked} onChange={(value) => { gender.setValue(value); setParams({ page: 1 }); }} />}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ft('common.noData')}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('inbody.editMemberMeasurement') : ft('inbody.addMemberMeasurement')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('inbody.fileNumber')}</Label>
              <Input className="nums" readOnly value={editId ? toArabicDigits(editId) : nextFileNumber ? toArabicDigits(nextFileNumber) : ft('inbody.determiningFileNumber')} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <MemberSearchCombobox
                forMeasurementOperation
                selectedMember={selectedMember}
                onSelect={(member) => {
                  setSelectedMember(member);
                  setForm((current) => ({ ...current, memberCode: member.memberCode }));
                  if (!editId) void loadContext(member);
                }}
                onClear={() => {
                  setSelectedMember(null);
                  setContext(null);
                  setOfferId('');
                  setForm((current) => ({ ...current, memberCode: '' }));
                }}
                disabled={Boolean(editId)}
              />
            </div>
            {!editId && loadingContext ? (
              <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {ui('جارٍ فحص رصيد InBody…')}
              </div>
            ) : !editId && context ? (
              <section className="rounded-xl border bg-muted/30 p-4" aria-label={ui('رصيد InBody')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{ui('الرصيد المتاح')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{ui('يتم الخصم تلقائيًا من الرصيد الأقرب انتهاءً.')}</p>
                  </div>
                  <span className="nums rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                    {toArabicDigits(context.totalRemaining)} {ui('قياس')}
                  </span>
                </div>
                {context.balances.length > 0 && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {context.balances.map((balance) => (
                      <div key={`${balance.source}-${balance.id}`} className="flex items-center justify-between gap-3 text-sm">
                        <span>{balance.label}</span>
                        <span className="nums text-muted-foreground">
                          {toArabicDigits(balance.remaining)} {ui('متبقي')}
                          {balance.expiresAt ? `${ui(' · حتى ')}${toArabicDigits(balance.expiresAt)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {!editId && hasBalance && context ? (
              <div className="grid gap-2">
                <Label id="inbody-settle-label">{ui('طريقة التسوية')}</Label>
                <div role="radiogroup" aria-labelledby="inbody-settle-label" className="grid grid-cols-2 gap-2">
                  {([
                    ['balance', ui('خصم من الرصيد'), ui('يُخصم قياس من رصيد العضو')],
                    ['paid', ui('قياس مدفوع'), ui('يُحصَّل سعره ويبقى الرصيد كما هو')],
                  ] as const).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={settle === value}
                      disabled={saving}
                      onClick={() => chooseSettle(value)}
                      className={cn(
                        'flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        settle === value ? 'border-primary bg-primary/10 text-foreground' : 'bg-background hover:border-primary/50',
                      )}
                    >
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-xs text-muted-foreground">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {!editId && requiresPayment && context ? (
              <section className="space-y-3 border-t pt-4" aria-label={ui('تحصيل InBody')}>
                {saleBlocked ? (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {ui('هذا الفرع لا يسمح ببيع InBody بدون اشتراك جيم فعّال. يمكن تغيير ذلك من تبويب الإعدادات.')}
                  </p>
                ) : context.offers.length === 0 ? (
                  <p role="alert" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                    {ui('لا يوجد سعر InBody لفرع العضو. أضف سعر القياس من تبويب «الإعدادات»، ثم سجّل القياس.')}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{ui('القياس أو الباقة')}</Label>
                      <select className={SELECT_CLS} value={offerId} onChange={(event) => setOfferId(event.target.value)}>
                        <option value="">{ui('اختر')}</option>
                        {context.offers.map((offer) => (
                          <option key={offer.id} value={offer.id}>
                            {offer.name} — {toArabicDigits(offer.measurementCount)} {ui('قياس')} — {toArabicDigits(offer.price)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label>{ui('طريقة الدفع')}</Label>
                      <select className={SELECT_CLS} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                        {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{ui(label)}</option>)}
                      </select>
                    </div>
                    {selectedOffer ? (
                      <p className="text-sm text-muted-foreground sm:col-span-2">
                        {ui('سيتم تحصيل')} <strong className="nums text-foreground">{toArabicDigits(selectedOffer.price)}</strong>
                        {selectedOffer.measurementCount > 1
                          ? `${ui(' ويتبقى للعضو ')}${toArabicDigits(selectedOffer.measurementCount - 1)}${ui(' قياس بعد تسجيل القياس الحالي.')}`
                          : ` ${ui('مقابل القياس الحالي.')}`}
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}

            <div className="grid gap-2">
              <Label>{ft('common.date')}</Label>
              <Input type="date" className="nums" disabled={todayOnly} value={form.measurementDate} onChange={(e) => setForm((f) => ({ ...f, measurementDate: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('inbody.file')}</Label>
              {form.reportUrl ? (
                <div className="flex items-center gap-2">
                  <a
                    href={uploadUrl(form.reportUrl) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-brand underline"
                  >
                    <FileText className="size-4" /> {ft('inbody.viewReport')}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={ft('common.delete')}
                    onClick={() => setForm((f) => ({ ...f, reportUrl: '' }))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                  <Upload className="size-4" />
                  {uploading ? ft('inbody.uploading') : ft('inbody.uploadReport')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void onPickReport(e.target.files?.[0])}
                  />
                </label>
              )}
              <span className="text-xs text-muted-foreground">{ft('inbody.reportHint')}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            <Button
              variant="brand"
              onClick={() => void save()}
              disabled={saving || uploading || (!editId && (loadingContext || !context || saleBlocked || (requiresPayment && !offerId)))}
            >
              {!editId && requiresPayment ? ui('تسجيل وتحصيل') : ft('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <InbodyMemberDetailDialog
        memberId={profileMemberId}
        open={profileMemberId != null}
        onOpenChange={(next) => { if (!next) setProfileMemberId(null); }}
      />
    </div>
  );
}
