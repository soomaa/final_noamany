import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { uiStatic } from '@/lib/ui-static';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface LoanRow {
  id: number;
  tRkm?: number;
  employeeName?: string;
  amount?: number;
  remaining?: number;
  installments?: number;
  installmentAmount?: number;
  repaymentMethod?: number;
  deductionStartDate?: string;
  status?: string;
  createdAt?: string;
}

interface LoanFormMeta {
  nextRequestNumber: number;
  requestDate: string;
  maxInstallments: number;
}

interface EmployeeLoanMeta {
  empId: number;
  employeeName?: string;
  employeeCode?: number;
  jobTitle?: string;
  department?: string;
  section?: string;
  ceiling: number;
  maxInstallments: number;
  hasActiveLoan: boolean;
  previousRequests: number;
  previousRequestDate: string;
}

interface LoanSchedule {
  loan: {
    id: number;
    tRkm?: number;
    employeeName?: string;
    amount?: number;
    installments?: number;
  };
  installments: Array<{
    id: number;
    no: number;
    dueDate?: string;
    amount: number;
    paid: boolean;
    pending: boolean;
  }>;
  summary: { total: number; paid: number; remaining: number };
}

interface CreateLoanForm {
  empId: string;
  amount: string;
  repaymentMethod: string;
  installments: string;
  requestDate: string;
  deductionStartDate: string;
  reason: string;
}

const EMPTY_FORM: CreateLoanForm = {
  empId: '',
  amount: '',
  repaymentMethod: '',
  installments: '',
  requestDate: '',
  deductionStartDate: '',
  reason: '',
};

const REPAYMENT_METHODS: Record<number, string> = {
  1: 'دفع نقدًا',
  2: 'تُخصم مرة واحدة من الراتب',
  3: 'تُخصم شهريًا من الراتب',
};

const LOAN_STATUS_TABS = [
  { value: '', label: uiStatic('كل الطلبات') },
  { value: 'incoming', label: uiStatic('الواردة') },
  { value: 'approved', label: uiStatic('المقبولة') },
  { value: 'rejected', label: uiStatic('المرفوضة') },
];

export function LoansPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LoanRow>('loans', params);
  const { data: empOptions = [] } = useEmployeeOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateLoanForm>(EMPTY_FORM);
  const [formMeta, setFormMeta] = useState<LoanFormMeta>();
  const [employeeMeta, setEmployeeMeta] = useState<EmployeeLoanMeta>();
  const [metaLoading, setMetaLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<LoanSchedule>();
  const [scheduleLoading, setScheduleLoading] = useState(false);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    void api.get<LoanFormMeta>('/loans/form-meta').then(({ data: meta }) => {
      if (cancelled) return;
      setFormMeta(meta);
      setCreateForm((current) => ({
        ...current,
        requestDate: current.requestDate || meta.requestDate,
        deductionStartDate: current.deductionStartDate || meta.requestDate,
      }));
    }).catch((e) => toast.error(apiError(e)));
    return () => { cancelled = true; };
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen || !createForm.empId) {
      setEmployeeMeta(undefined);
      return;
    }
    let cancelled = false;
    setMetaLoading(true);
    void api.get<EmployeeLoanMeta>(`/loans/ceiling/${createForm.empId}`).then(({ data: meta }) => {
      if (!cancelled) setEmployeeMeta(meta);
    }).catch((e) => {
      if (!cancelled) toast.error(apiError(e));
    }).finally(() => {
      if (!cancelled) setMetaLoading(false);
    });
    return () => { cancelled = true; };
  }, [createForm.empId, createOpen]);

  const installmentValue = useMemo(() => {
    const amount = Number(createForm.amount);
    const installments = Number(createForm.installments);
    return amount > 0 && installments > 0 ? Math.round(amount / installments) : 0;
  }, [createForm.amount, createForm.installments]);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/loans/${id}`),
    { success: ui('تم حذف السلفة'), invalidate: ['loans'] },
  );

  const handleDelete = async (row: LoanRow) => {
    const ok = await confirm({
      title: ui('حذف السلفة'),
      description: `${ui('هل تريد حذف سلفة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const showSchedule = async (row: LoanRow) => {
    setSchedule(undefined);
    setScheduleOpen(true);
    setScheduleLoading(true);
    try {
      const { data: details } = await api.get<LoanSchedule>(`/loans/${row.id}/schedule`);
      setSchedule(details);
    } catch (e) {
      toast.error(apiError(e));
      setScheduleOpen(false);
    } finally {
      setScheduleLoading(false);
    }
  };

  const columns: ColumnDef<LoanRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'tRkm', header: ui('رقم الطلب'), cell: ({ getValue }) => toArabicDigits((getValue() as number | undefined) ?? '—') },
    { accessorKey: 'createdAt', header: ui('تاريخ الطلب'), cell: ({ getValue }) => <DateText value={getValue() as string | undefined} /> },
    { accessorKey: 'employeeName', header: ui('اسم الموظف') },
    { accessorKey: 'amount', header: ui('قيمة السلفة'), cell: ({ getValue }) => <Money value={getValue() as number | undefined} /> },
    {
      accessorKey: 'repaymentMethod',
      header: ui('طريقة السداد'),
      cell: ({ getValue }) => ui(REPAYMENT_METHODS[Number(getValue())] ?? '—'),
    },
    { accessorKey: 'installments', header: ui('عدد الأقساط'), cell: ({ getValue }) => toArabicDigits((getValue() as number | undefined) ?? '—') },
    { accessorKey: 'installmentAmount', header: ui('قيمة القسط'), cell: ({ getValue }) => <Money value={getValue() as number | undefined} /> },
    { accessorKey: 'deductionStartDate', header: ui('بداية الخصم'), cell: ({ getValue }) => <DateText value={getValue() as string | undefined} /> },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const value = String(getValue() ?? 'pending');
        const status: StatusKey = value === 'paid' ? 'paid' : value === 'approved' ? 'approved' : value === 'rejected' ? 'rejected' : 'pending';
        return <StatusBadge status={status} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('جدولة الأقساط')} onClick={() => void showSchedule(row.original)}>
            <CalendarDays className="size-4 text-primary" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const openCreate = () => {
    setCreateForm(EMPTY_FORM);
    setEmployeeMeta(undefined);
    setFormMeta(undefined);
    setCreateOpen(true);
  };

  const changeRepaymentMethod = (value: string) => {
    setCreateForm((form) => ({
      ...form,
      repaymentMethod: value,
      installments: value === '1' || value === '2' ? '1' : '',
    }));
  };

  const saveLoan = async () => {
    const amount = Number(createForm.amount);
    const installments = Number(createForm.installments);
    const method = Number(createForm.repaymentMethod);
    if (!createForm.empId || amount <= 0 || installments <= 0 || ![1, 2, 3].includes(method) || !createForm.requestDate || !createForm.deductionStartDate) {
      toast.error(ui('أكملي بيانات السلفة المطلوبة'));
      return;
    }
    if (employeeMeta?.hasActiveLoan) {
      toast.error(ui('لا يمكن إضافة سلفة جديدة لوجود سلفة قائمة لم تُسدّد بعد'));
      return;
    }
    const maxInstallments = employeeMeta?.maxInstallments ?? formMeta?.maxInstallments ?? 0;
    if (maxInstallments > 0 && installments > maxInstallments) {
      toast.error(`${ui('الحد الأقصى لعدد الأقساط هو')} ${toArabicDigits(maxInstallments)}`);
      return;
    }
    if ((employeeMeta?.ceiling ?? 0) > 0 && amount > employeeMeta!.ceiling) {
      toast.error(`${ui('قيمة السلفة تتجاوز الحد الأقصى المسموح به')} (${toArabicDigits(employeeMeta!.ceiling)})`);
      return;
    }

    setSaving(true);
    try {
      await api.post('/loans', {
        empId: Number(createForm.empId),
        amount,
        installments,
        sadadSolfa: method,
        requestDate: createForm.requestDate,
        deductionStartDate: createForm.deductionStartDate,
        reason: createForm.reason.trim(),
      });
      toast.success(ui('تم حفظ السلفة وإنشاء جدول الأقساط'));
      setCreateOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('السلف')} />
        <NotImplementedState title={ui('السلف قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('السلف')}
        description={ui('إدارة سلف وقروض الموظفين')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('طلب سلفة')}
          </Button>
        }
      />
      <ListStatusTabs tabs={LOAN_STATUS_TABS} />
      <FilterBar searchPlaceholder={ui('بحث في السلف…')} />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        emptyTitle={ui('لا توجد سلف')}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="form" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('طلب سلفة')}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-12">
            <ReadOnlyField className="md:col-span-2" label={ui('رقم الطلب')} value={formMeta ? toArabicDigits(formMeta.nextRequestNumber) : '…'} />
            <FormField className="md:col-span-3" label={ui('تاريخ الطلب')}>
              <Input type="date" value={createForm.requestDate} onChange={(event) => setCreateForm((form) => ({ ...form, requestDate: event.target.value }))} />
            </FormField>
            <div className="md:col-span-7">
              <Label>{ui('اسم الموظف')}</Label>
              <div className="mt-1.5">
                <Combobox value={createForm.empId} onValueChange={(empId) => setCreateForm((form) => ({ ...form, empId }))} options={empOptions} placeholder={ui('اختر الموظف…')} />
              </div>
            </div>

            <ReadOnlyField className="md:col-span-3" label={ui('الرقم الوظيفي')} value={metaLoading ? '…' : employeeMeta?.employeeCode} />
            <ReadOnlyField className="md:col-span-5" label={ui('المسمى الوظيفي')} value={metaLoading ? '…' : employeeMeta?.jobTitle} />
            <ReadOnlyField className="md:col-span-4" label={ui('الإدارة')} value={metaLoading ? '…' : employeeMeta?.department} />

            {employeeMeta?.hasActiveLoan && (
              <div className="md:col-span-12 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                {ui('عذرًا، لا يمكن طلب سلفة لهذا الموظف لوجود سلفة لم تنتهِ أقساطها بعد.')}
              </div>
            )}

            <FormField className="md:col-span-3" label={ui('قيمة السلفة')}>
              <Input type="number" min="1" className="nums" value={createForm.amount} onChange={(event) => setCreateForm((form) => ({ ...form, amount: event.target.value }))} />
            </FormField>
            <FormField className="md:col-span-4" label={ui('طريقة سداد السلفة')}>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.repaymentMethod}
                onChange={(event) => changeRepaymentMethod(event.target.value)}
              >
                <option value="">{ui('اختر')}</option>
                <option value="1">{ui(REPAYMENT_METHODS[1])}</option>
                <option value="2">{ui(REPAYMENT_METHODS[2])}</option>
                <option value="3">{ui(REPAYMENT_METHODS[3])}</option>
              </select>
            </FormField>
            <FormField className="md:col-span-2" label={ui('عدد الأقساط')}>
              <Input
                type="number"
                min="1"
                max={employeeMeta?.maxInstallments || formMeta?.maxInstallments || undefined}
                readOnly={createForm.repaymentMethod === '1' || createForm.repaymentMethod === '2'}
                className="nums"
                value={createForm.installments}
                onChange={(event) => setCreateForm((form) => ({ ...form, installments: event.target.value }))}
              />
            </FormField>
            <ReadOnlyField className="md:col-span-3" label={ui('قيمة القسط')} value={installmentValue ? toArabicDigits(installmentValue) : undefined} />

            <FormField className="md:col-span-3" label={ui('تاريخ بداية الخصم')}>
              <Input type="date" value={createForm.deductionStartDate} onChange={(event) => setCreateForm((form) => ({ ...form, deductionStartDate: event.target.value }))} />
            </FormField>
            <ReadOnlyField className="md:col-span-3" label={ui('عدد مرات السلف السابقة')} value={employeeMeta ? toArabicDigits(employeeMeta.previousRequests) : undefined} />
            <ReadOnlyField className="md:col-span-3" label={ui('تاريخ آخر سلفة')} value={employeeMeta?.previousRequestDate ? <DateText value={employeeMeta.previousRequestDate} /> : undefined} />
            <ReadOnlyField className="md:col-span-3" label={ui('حد السلفة')} value={employeeMeta?.ceiling ? <Money value={employeeMeta.ceiling} /> : undefined} />

            <FormField className="md:col-span-12" label={ui('سبب السلفة')}>
              <Input maxLength={100} value={createForm.reason} onChange={(event) => setCreateForm((form) => ({ ...form, reason: event.target.value }))} />
            </FormField>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void saveLoan()} disabled={saving || metaLoading || employeeMeta?.hasActiveLoan}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent size="xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('جدولة الأقساط')}{schedule?.loan.tRkm ? ` — ${toArabicDigits(schedule.loan.tRkm)}` : ''}</DialogTitle>
          </DialogHeader>
          {scheduleLoading ? (
            <div className="py-10 text-center text-muted-foreground">{ui('جارٍ التحميل…')}</div>
          ) : schedule ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-3">
                <div><span className="text-xs text-muted-foreground">{ui('الموظف')}</span><div className="font-medium">{schedule.loan.employeeName ?? '—'}</div></div>
                <div><span className="text-xs text-muted-foreground">{ui('إجمالي السلفة')}</span><div><Money value={schedule.summary.total} /></div></div>
                <div><span className="text-xs text-muted-foreground">{ui('المتبقي')}</span><div><Money value={schedule.summary.remaining} /></div></div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60"><tr><th className="p-3 text-start">{ui('م')}</th><th className="p-3 text-start">{ui('تاريخ الاستحقاق')}</th><th className="p-3 text-start">{ui('قيمة القسط')}</th><th className="p-3 text-start">{ui('الحالة')}</th></tr></thead>
                  <tbody>
                    {schedule.installments.map((installment) => (
                      <tr key={installment.id} className="border-t">
                        <td className="p-3">{toArabicDigits(installment.no)}</td>
                        <td className="p-3"><DateText value={installment.dueDate} /></td>
                        <td className="p-3"><Money value={installment.amount} /></td>
                        <td className="p-3"><StatusBadge status={installment.paid ? 'paid' : 'pending'} label={ui(installment.paid ? 'مسدد' : installment.pending ? 'معلّق' : 'غير مسدد')} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ReadOnlyField({ label, value, className }: { label: string; value?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <div className="mt-1.5 flex min-h-10 items-center rounded-md border bg-muted/45 px-3 py-2 text-sm">{value ?? '—'}</div>
    </div>
  );
}
