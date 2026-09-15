import { Check, Copy, ExternalLink, Loader2, Save, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DwamScheduleGrid, defaultDwamSchedule } from '@/components/common/dwam-schedule-grid';
import { DateText } from '@/components/common/formatters';
import { FinanceRowsEditor, type FinanceRow } from '@/components/common/finance-rows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { useLookups, useResource } from '@/lib/api-hooks';
import type {
  DwamData,
  EmployeeBankRow,
  EmployeeContract,
  EmployeeDocumentFile,
  EmployeeInsurance,
  FinanceData,
} from '@/types/employees';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

function ProfileField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function TabLoading() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function FinanceTab({ data, loading, empId }: { data?: FinanceData; loading?: boolean; empId: string }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { data: allowanceTypes } = useLookups('allowance');
  const { data: deductionTypes } = useLookups('deduction');
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [basicSalary, setBasicSalary] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setRows(data.rows.map((r) => ({ ...r, insurance_affect: r.insurance_affect ?? false })));
    setBasicSalary(data.basic_salary ?? '');
  }, [data]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['employees', empId, 'finance'] });

  // Per-row delete: persisted rows (numeric server id) hit the DELETE endpoint;
  // unsaved rows are dropped locally.
  const handleDelete = async (row: FinanceRow) => {
    if (/^\d+$/.test(row.id)) {
      const ok = await confirm({
        title: ui('حذف البند المالي'),
        description: ui('سيتم حذف هذا البند نهائيًا.'),
        variant: 'destructive',
        confirmLabel: ui('حذف'),
      });
      if (!ok) return;
      try {
        await api.delete(`/employees/${empId}/finance/${row.id}`);
        setRows((rs) => rs.filter((r) => r.id !== row.id));
        toast.success(ui('تم حذف البند'));
        invalidate();
      } catch (e) {
        toast.error(apiError(e));
      }
    } else {
      setRows((rs) => rs.filter((r) => r.id !== row.id));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/employees/${empId}/finance`, { rows, basic_salary: basicSalary });
      toast.success(ui('تم حفظ البيانات المالية'));
      invalidate();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TabLoading />;

  return (
    <div className="space-y-6">
      <FinanceRowsEditor
        rows={rows}
        onChange={setRows}
        onDeleteRow={handleDelete}
        allowanceTypes={allowanceTypes}
        deductionTypes={deductionTypes}
        basicSalary={basicSalary}
        onBasicSalaryChange={setBasicSalary}
      />
      <div className="flex justify-end">
        <Button variant="brand" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          <Save className="size-4" /> {ui('حفظ المالية')}
        </Button>
      </div>
    </div>
  );
}

export function InsuranceTab({ data, loading }: { data?: EmployeeInsurance; loading?: boolean }) {
  
  const { ui } = useLocale();
  if (loading) return <TabLoading />;
  if (!data) return <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات تأمين.')}</p>;
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ProfileField label={ui('نوع التأمين')} value={data.type_tamin ?? '—'} />
      <ProfileField label={ui('رقم التأمين')} value={data.tamin_rkm != null ? toArabicDigits(data.tamin_rkm) : '—'} />
      <ProfileField label={ui('المسمى التأميني')} value={data.tamin_mosama_wazefy ?? '—'} />
      <ProfileField label={ui('الأجر التأميني')} value={data.tamin_rateb ? toArabicDigits(data.tamin_rateb) : '—'} />
      <ProfileField label={ui('حصة الموظف')} value={data.tamin_hesa_emp ? toArabicDigits(data.tamin_hesa_emp) : '—'} />
      <ProfileField label={ui('حصة صاحب العمل')} value={data.tamin_hesa_oner ? toArabicDigits(data.tamin_hesa_oner) : '—'} />
      <ProfileField label={ui('التأمين الطبي')} value={data.type_tamin__medicine ?? '—'} />
      <ProfileField label={ui('شركة التأمين')} value={data.tamin_company ?? '—'} />
      <ProfileField label={ui('رقم التأمين الطبي')} value={data.tamin_medicine_num ? toArabicDigits(data.tamin_medicine_num) : '—'} />
      <ProfileField label={ui('رقم البوليصة')} value={data.polica_num ? toArabicDigits(data.polica_num) : '—'} />
      <ProfileField label={ui('تاريخ بدء التأمين')} value={<DateText value={data.start_tamin_date_m} />} />
      <ProfileField label={ui('تاريخ التأمين')} value={<DateText value={data.tamin_date_m} />} />
    </dl>
  );
}

export function DocumentsTab({ data, loading }: { data?: EmployeeDocumentFile[]; loading?: boolean }) {
  
  const { ui } = useLocale();
  if (loading) return <TabLoading />;
  if (!data?.length) return <p className="text-sm text-muted-foreground">{ui('لا توجد مستندات مرفقة.')}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{ui('المستند')}</TableHead>
            <TableHead>{ui('من')}</TableHead>
            <TableHead>{ui('إلى')}</TableHead>
            <TableHead>{ui('تنبيه')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>{doc.title}</TableCell>
              <TableCell className="nums">{doc.from_date ? toArabicDigits(doc.from_date) : '—'}</TableCell>
              <TableCell className="nums">{doc.to_date ? toArabicDigits(doc.to_date) : '—'}</TableCell>
              <TableCell>{doc.tanbih_fk === 1 ? ui('نعم') : ui('لا')}</TableCell>
              <TableCell>
                {doc.emp_file && (
                  <a
                    href={`/uploads/${doc.emp_file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {ui('عرض')} <ExternalLink className="size-3.5" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function BanksTab({ data, loading }: { data?: EmployeeBankRow[]; loading?: boolean }) {
  
  const { ui } = useLocale();
  if (loading) return <TabLoading />;
  if (!data?.length) return <p className="text-sm text-muted-foreground">{ui('لا توجد حسابات بنكية.')}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{ui('صاحب الحساب')}</TableHead>
            <TableHead>{ui('رقم الحساب')}</TableHead>
            <TableHead>{ui('معتمد للصرف')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((b) => (
            <TableRow key={b.id}>
              <TableCell>{b.emp_bank_name ?? '—'}</TableCell>
              <TableCell className="nums">{toArabicDigits(b.bank_account_num)}</TableCell>
              <TableCell>{b.approved_for_sarf === 1 ? ui('نعم') : ui('لا')}</TableCell>
              <TableCell>
                {b.bank_id_fk_image && b.bank_id_fk_image !== '0' && (
                  <a
                    href={`/uploads/${b.bank_id_fk_image}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {ui('صورة الآيبان')}
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type ContractForm = {
  num_days_in_month: string;
  hours_work: string;
  hour_value: string;
  job_type: string;
  contract_nature: string;
  year_vacation_num: string;
  year_vacation_period: string;
  casual_vacation_num: string;
  vacation_previous_balance: string;
  travel_ticket: string;
  travel_period: string;
  bank_id_fk: string;
  bank_code: string;
  bank_account_num: string;
  reward_end_work: boolean;
};

const emptyContract: ContractForm = {
  num_days_in_month: '',
  hours_work: '',
  hour_value: '',
  job_type: '',
  contract_nature: '',
  year_vacation_num: '',
  year_vacation_period: '',
  casual_vacation_num: '',
  vacation_previous_balance: '',
  travel_ticket: '',
  travel_period: '',
  bank_id_fk: '',
  bank_code: '',
  bank_account_num: '',
  reward_end_work: false,
};

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="nums mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function ContractTab({ data,
  loading,
  empId,
}: {
  data?: EmployeeContract | null;
  loading?: boolean;
  empId: string;
}) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [form, setForm] = useState<ContractForm>(emptyContract);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) {
      setForm(emptyContract);
      return;
    }
    setForm({
      num_days_in_month: data.num_days_in_month ?? '',
      hours_work: data.hours_work ?? '',
      hour_value: data.hour_value ?? '',
      job_type: data.job_type ?? '',
      contract_nature: data.contract_nature != null ? String(data.contract_nature) : '',
      year_vacation_num: data.year_vacation_num ?? '',
      year_vacation_period: data.year_vacation_period ?? '',
      casual_vacation_num: data.casual_vacation_num ?? '',
      vacation_previous_balance:
        data.vacation_previous_balance != null ? String(data.vacation_previous_balance) : '',
      travel_ticket: data.travel_ticket ?? '',
      travel_period: data.travel_period ?? '',
      bank_id_fk: data.bank_id_fk ?? '',
      bank_code: data.bank_code ?? '',
      bank_account_num: data.bank_account_num ?? '',
      reward_end_work: data.reward_end_work === 1,
    });
  }, [data]);

  const set = (patch: Partial<ContractForm>) => setForm((f) => ({ ...f, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/employees/${empId}/contract`, {
        ...form,
        reward_end_work: form.reward_end_work ? 1 : 0,
      });
      toast.success(ui('تم حفظ بيانات العقد'));
      void qc.invalidateQueries({ queryKey: ['employees', empId, 'contract'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TabLoading />;

  return (
    <div className="space-y-6">
      {!data && (
        <p className="text-sm text-muted-foreground">{ui('لا يوجد عقد مسجّل — أدخل البيانات واحفظ لإنشائه.')}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumField label={ui('أيام العمل في الشهر')} value={form.num_days_in_month} onChange={(v) => set({ num_days_in_month: v })} />
        <NumField label={ui('ساعات العمل')} value={form.hours_work} onChange={(v) => set({ hours_work: v })} />
        <NumField label={ui('قيمة الساعة')} value={form.hour_value} onChange={(v) => set({ hour_value: v })} />
        <div>
          <Label>{ui('نوع الوظيفة')}</Label>
          <Input className="mt-1.5" value={form.job_type} onChange={(e) => set({ job_type: e.target.value })} />
        </div>
        <NumField label={ui('طبيعة العقد')} value={form.contract_nature} onChange={(v) => set({ contract_nature: v })} />
        <NumField label={ui('رصيد الإجازة السنوية')} value={form.year_vacation_num} onChange={(v) => set({ year_vacation_num: v })} />
        <NumField label={ui('فترة الإجازة السنوية')} value={form.year_vacation_period} onChange={(v) => set({ year_vacation_period: v })} />
        <NumField label={ui('رصيد الإجازة العارضة')} value={form.casual_vacation_num} onChange={(v) => set({ casual_vacation_num: v })} />
        <NumField label={ui('رصيد الإجازة السابق')} value={form.vacation_previous_balance} onChange={(v) => set({ vacation_previous_balance: v })} />
        <NumField label={ui('تذكرة سفر')} value={form.travel_ticket} onChange={(v) => set({ travel_ticket: v })} />
        <NumField label={ui('فترة تذكرة السفر')} value={form.travel_period} onChange={(v) => set({ travel_period: v })} />
        <NumField label={ui('رقم البنك')} value={form.bank_id_fk} onChange={(v) => set({ bank_id_fk: v })} />
        <div>
          <Label>{ui('كود البنك')}</Label>
          <Input className="nums mt-1.5" value={form.bank_code} onChange={(e) => set({ bank_code: e.target.value })} />
        </div>
        <div>
          <Label>{ui('رقم الحساب البنكي')}</Label>
          <Input className="nums mt-1.5" value={form.bank_account_num} onChange={(e) => set({ bank_account_num: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch
            id="reward_end_work"
            checked={form.reward_end_work}
            onCheckedChange={(v) => set({ reward_end_work: v })}
          />
          <Label htmlFor="reward_end_work">{ui('مكافأة نهاية الخدمة')}</Label>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="brand" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          <Save className="size-4" /> {ui('حفظ العقد')}
        </Button>
      </div>
    </div>
  );
}

const DAY_NAME_KEYS: Record<number, string> = {
  6: uiStatic('السبت'),
  0: uiStatic('الأحد'),
  1: uiStatic('الإثنين'),
  2: uiStatic('الثلاثاء'),
  3: uiStatic('الأربعاء'),
  4: uiStatic('الخميس'),
  5: uiStatic('الجمعة'),
};

export function AttendanceTab({ data, loading, editHref }: { data?: DwamData; loading?: boolean; editHref: string }) {
  
  const { ui } = useLocale();
  if (loading) return <TabLoading />;
  if (!data) return <p className="text-sm text-muted-foreground">{ui('لا يوجد جدول دوام.')}</p>;

  const schedule = defaultDwamSchedule().map((d) => {
    const fromApi = data.schedule.find((s) => s.day === d.day);
    return fromApi ? { ...d, ...fromApi, dayName: ui(DAY_NAME_KEYS[d.day] ?? d.dayName) } : d;
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {ui('نوع الدوام')}: <span className="font-medium text-foreground">{data.shift_type || '—'}</span>
      </p>
      <DwamScheduleGrid schedule={schedule} onChange={() => {}} readOnly />
      <p className="text-xs text-muted-foreground">
        <Link to={editHref} className="text-primary hover:underline">{ui('تعديل جدول الدوام')}</Link> {ui('من معالج الموظف.')}
      </p>
    </div>
  );
}

export function AppAccountTab({
  empId,
  appUserId,
}: {
  empId: string;
  appUserId?: number | null;
}) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ appUserId: number; phone: string | null; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: existingAppUser, isLoading: existingLoading } = useResource<{ id: number; phone: string | null }>(
    'app-users',
    appUserId ?? undefined,
  );

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post<{ appUserId: number; phone: string | null; password?: string; alreadyExists: boolean }>(
        `/employees/${empId}/app-user`,
      );
      if (data.alreadyExists) {
        toast.info(ui('الموظف لديه حساب تطبيق مسبقاً'));
      } else if (data.password) {
        setCreated({ appUserId: data.appUserId, phone: data.phone, password: data.password });
        toast.success(ui('تم إنشاء حساب التطبيق'));
      }
      void qc.invalidateQueries({ queryKey: ['employees', empId, 'profile'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: ui('حذف حساب التطبيق'),
      description: ui('سيُحذف حساب التطبيق ويُفصل عن الموظف. لا يمكن التراجع.'),
      variant: 'destructive',
    });
    if (!ok) return;
    setLoading(true);
    try {
      await api.delete(`/employees/${empId}/app-user`);
      setCreated(null);
      toast.success(ui('تم حذف حساب التطبيق'));
      void qc.invalidateQueries({ queryKey: ['employees', empId, 'profile'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = async () => {
    if (!created?.password) return;
    await navigator.clipboard.writeText(created.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (existingLoading || loading) return <TabLoading />;

  const linkedUser = created ?? (existingAppUser ? { appUserId: existingAppUser.id, phone: existingAppUser.phone, password: '' } : null);

  return (
    <div className="space-y-6">
      {!linkedUser ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Smartphone className="mx-auto mb-3 size-10 text-muted-foreground" />
          <h3 className="text-base font-medium">{ui('لا يوجد حساب تطبيق')}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {ui('أنشئ حساباً للموظف في التطبيق باستخدام رقم جواله وبريده المسجلين.')}
          </p>
          <Button className="mt-4" onClick={handleCreate}>
            <Smartphone className="me-2 size-4" />
            {ui('إنشاء حساب تطبيق')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{ui('حساب التطبيق')}</p>
                <p className="text-lg font-semibold">{linkedUser.phone ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{ui('معرف المستخدم:')} {linkedUser.appUserId}</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="me-2 size-4" />
                {ui('حذف الحساب')}
              </Button>
            </div>
          </div>

          {created?.password && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
              <p className="mb-2 text-sm font-medium text-yellow-900 dark:text-yellow-100">
                {ui('بيانات الدخول (تُعرض مرة واحدة فقط)')}
              </p>
              <div className="flex items-center gap-2">
                <Input value={created.password} readOnly className="font-mono text-yellow-900 dark:text-yellow-100" />
                <Button variant="outline" size="icon" onClick={copyPassword}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
