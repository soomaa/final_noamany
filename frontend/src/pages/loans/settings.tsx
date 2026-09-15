import { useQuery } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { toast } from 'sonner';
import { useLocale } from '@/store/locale';

interface MainSettings {
  id: number;
  da3mValue?: number;
  aqsaModaSadad?: number;
  hadAdna?: number;
  ratebAsasy?: number;
  bdlSakn?: number;
  bdlMowaslat?: number;
  bdlJwal?: number;
}

interface DawabtRow {
  id: number;
  title?: string;
  employeeName?: string;
}

export function LoanSettingsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: dawabt, isLoading: dawabtLoading, isError, error } = usePaginatedList<DawabtRow>('loans/settings', params);
  const { data: main, isLoading: mainLoading, refetch } = useQuery({
    queryKey: ['loans/settings', 'main'],
    queryFn: async () => {
      const { data } = await api.get<MainSettings>('/loans/settings/main');
      return data;
    },
    retry: false,
  });

  const [form, setForm] = useState<Partial<MainSettings>>({});
  const [saving, setSaving] = useState(false);

  const patch = (k: keyof MainSettings, v: string) => setForm((f) => ({ ...f, [k]: Number(v) || 0 }));

  const saveMain = async () => {
    setSaving(true);
    try {
      const payload = { ...main, ...form };
      await api.patch('/loans/settings/main', {
        da3mValue: payload.da3mValue,
        aqsaModaSadad: payload.aqsaModaSadad,
        hadAdna: payload.hadAdna,
        ratebAsasy: payload.ratebAsasy,
        bdlSakn: payload.bdlSakn,
        bdlMowaslat: payload.bdlMowaslat,
        bdlJwal: payload.bdlJwal,
      });
      toast.success(ui('تم حفظ الإعدادات'));
      void refetch();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<DawabtRow>[] = [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits(row.index + 1) },
    { accessorKey: 'title', header: ui('العنوان') },
    { accessorKey: 'employeeName', header: ui('النوع') },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('إعدادات السلف')} />
        <NotImplementedState title={ui('إعدادات السلف — قيد الإعداد على الخادم')} />
      </div>
    );
  }

  const m = { ...main, ...form };

  return (
    <div className="space-y-6">
      <PageHeader title={ui('إعدادات السلف')} description={ui('سياسات وحدود السلف والقروض')} />
      <Tabs defaultValue="main">
        <TabsList>
          <TabsTrigger value="main">{ui('الإعدادات الرئيسية')}</TabsTrigger>
          <TabsTrigger value="dawabt">{ui('الضوابط والمستندات')}</TabsTrigger>
        </TabsList>
        <TabsContent value="main">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{ui('سياسة السلف')}</CardTitle>
              <Button variant="brand" size="sm" onClick={() => void saveMain()} disabled={saving || mainLoading}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {ui('حفظ')}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              {[
                ['da3mValue', ui('قيمة الدعم')],
                ['aqsaModaSadad', ui('أقصى مدة سداد (شهر)')],
                ['hadAdna', ui('الحد الأدنى')],
                ['ratebAsasy', ui('يشمل الراتب الأساسي')],
                ['bdlSakn', ui('يشمل بدل السكن')],
                ['bdlMowaslat', ui('يشمل بدل المواصلات')],
                ['bdlJwal', ui('يشمل بدل الجوال')],
              ].map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    className="nums"
                    defaultValue={m[key as keyof MainSettings] ?? ''}
                    onChange={(e) => patch(key as keyof MainSettings, e.target.value)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="dawabt">
          <DataTable
            columns={columns}
            data={dawabt?.data ?? []}
            total={dawabt?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
            isLoading={dawabtLoading}
            emptyTitle={ui('لا توجد ضوابط')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
