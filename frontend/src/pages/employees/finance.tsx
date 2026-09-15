import { ArrowRight, Loader2, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FinanceRowsEditor, type FinanceRow } from '@/components/common/finance-rows';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { useLookups, useResource } from '@/lib/api-hooks';
import { queryClient } from '@/lib/query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { FinanceData } from '@/types/employees';

interface EmployeeIdentity {
  emp_code?: string | number;
  emp_name?: string;
  employee?: string;
}

export function EmployeeFinancePage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data: employee, isLoading: employeeLoading, isError, refetch } = useResource<EmployeeIdentity>('employees', id, 'identity');
  const { data: finance, isLoading: financeLoading } = useResource<FinanceData>('employees', id, 'finance');
  const { data: allowanceTypes } = useLookups('allowance');
  const { data: deductionTypes } = useLookups('deduction');
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [basicSalary, setBasicSalary] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!finance) return;
    setBasicSalary(finance.basic_salary ?? '');
    setRows(finance.rows.map((row) => ({
      ...row,
      specific_period: row.specific_period ?? Boolean(row.date_from || row.date_to),
      insurance_affect: row.insurance_affect ?? false,
    })));
  }, [finance]);

  const totals = useMemo(() => rows.reduce(
    (sum, row) => {
      const value = Number(row.value) || 0;
      if (row.badl_type === '1') {
        sum.allowances += value;
        if (row.insurance_affect) sum.insured += value;
      } else {
        sum.deductions += value;
      }
      return sum;
    },
    { allowances: Number(basicSalary) || 0, deductions: 0, insured: Number(basicSalary) || 0 },
  ), [basicSalary, rows]);

  const save = async () => {
    if (!id) return;
    if (!Number.isFinite(Number(basicSalary)) || Number(basicSalary) <= 0) {
      toast.error(ui('الراتب الأساسي يجب أن يكون رقمًا أكبر من صفر'));
      return;
    }
    if (rows.some((row) => !row.badl_discount_id_fk || !row.value)) {
      toast.error(ui('يرجى استكمال اسم وقيمة كل بند مالي'));
      return;
    }
    setSaving(true);
    try {
      await api.put(`/employees/${id}/finance`, { rows, basic_salary: basicSalary });
      toast.success(ui('تم حفظ البيانات المالية'));
      void queryClient.invalidateQueries({ queryKey: ['employees', id, 'finance'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (employeeLoading || financeLoading) return <Skeleton className="h-72 w-full" />;

  const employeeName = employee?.emp_name ?? employee?.employee ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('البيانات المالية للموظف')}
        description={`${employeeName} · ${ui('كود الموظف')}: ${toArabicDigits(employee?.emp_code ?? '—')}`}
        actions={(
          <Button variant="outline" asChild>
            <Link to="/employees"><ArrowRight className="size-4" />{ui('رجوع')}</Link>
          </Button>
        )}
      />

      <Card>
        <CardContent className="space-y-8 pt-6">
          <FinanceRowsEditor
            rows={rows}
            onChange={setRows}
            allowanceTypes={allowanceTypes}
            deductionTypes={deductionTypes}
            basicSalary={basicSalary}
            onBasicSalaryChange={setBasicSalary}
          />

          <div className="grid gap-3 border-t pt-6 sm:grid-cols-3">
            <Summary label={ui('إجمالي بنود الاستحقاقات')} value={totals.allowances} />
            <Summary label={ui('إجمالي الخاضع للتأمينات')} value={totals.insured} />
            <Summary label={ui('إجمالي بنود الاستقطاعات')} value={totals.deductions} />
          </div>

          <div className="flex justify-end">
            <Button variant="brand" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {ui('حفظ البيانات المالية')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="nums mt-1 text-xl font-bold">{toArabicDigits(value)}</p>
    </div>
  );
}
