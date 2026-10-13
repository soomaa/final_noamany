import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, CreditCard, FileText, Bell, BarChart3, Settings, CalendarClock, WalletCards, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import { PosInvoiceTemplatesEditor } from '@/components/sales/pos-invoice-templates-editor';

type Tab = 'devices' | 'payments' | 'invoices' | 'reports' | 'notifications' | 'settings' | 'shifts';

type PosSettingRow = { key: string; value: unknown; type?: string; description?: string };

export function PosAdminPage() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('settings');
  const [newName, setNewName] = useState('');
  const [newPaymentBase, setNewPaymentBase] = useState<'cash' | 'card' | 'wallet' | 'transfer'>('card');

  const { data: devices } = useQuery({
    queryKey: ['pos-devices'],
    queryFn: async () => (await api.get('/pos-devices', { params: { pageSize: 100 } })).data,
    enabled: tab === 'devices',
  });

  const { data: payments } = useQuery({
    queryKey: ['pos-payment-methods'],
    queryFn: async () => (await api.get('/pos-payment-methods', { params: { pageSize: 100 } })).data,
    enabled: tab === 'payments',
  });

  const createDevice = useMutation({
    mutationFn: (name: string) => api.post('/pos-devices', { name, deviceType: 'terminal' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos-devices'] }); setNewName(''); },
    onError: (e) => toast.error(apiError(e)),
  });

  const createPayment = useMutation({
    mutationFn: (name: string) => {
      const code = `${newPaymentBase}-${Date.now().toString(36)}`;
      return api.post('/pos-payment-methods', { name, code, baseMethod: newPaymentBase });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos-payment-methods'] }); setNewName(''); },
    onError: (e) => toast.error(apiError(e)),
  });
  const togglePayment = useMutation({
    mutationFn: (id: number) => api.patch(`/pos-payment-methods/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-payment-methods'] }),
    onError: (e) => toast.error(apiError(e)),
  });

  const tabs: Array<{ id: Tab; label: string; icon: typeof Monitor }> = [
    { id: 'settings', label: ui('الإعدادات'), icon: Settings },
    { id: 'shifts', label: ui('الورديات والخزينة'), icon: CalendarClock },
    { id: 'devices', label: ui('الأجهزة'), icon: Monitor },
    { id: 'payments', label: ui('طرق الدفع'), icon: CreditCard },
    { id: 'invoices', label: ui('قوالب الفواتير'), icon: FileText },
    { id: 'reports', label: ui('قوالب التقارير'), icon: BarChart3 },
    { id: 'notifications', label: ui('قواعد الإشعار'), icon: Bell },
  ];

  return (
    <GymSalesPageShell section="sales" title={ui('إعدادات نقطة البيع')} description={ui('الضريبة، الأجهزة، طرق الدفع، القوالب، والإشعارات')}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4 flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-1">
              <t.icon className="h-4 w-4" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="settings">
          <GeneralPosSettings ui={ui} />
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader><CardTitle>{ui('أجهزة POS')}</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-2">
                <Input placeholder={ui('اسم الجهاز')} value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Button onClick={() => newName && createDevice.mutate(newName)} disabled={createDevice.isPending}>{ui('إضافة')}</Button>
              </div>
              <ul className="space-y-2">
                {(devices?.data ?? []).map((d: { id: number; name: string; deviceType: string; isActive: boolean }) => (
                  <li key={d.id} className="flex justify-between rounded border p-2 text-sm">
                    <span>{d.name} — {d.deviceType}</span>
                    <span className={d.isActive ? 'text-green-600' : 'text-muted-foreground'}>{d.isActive ? ui('نشط') : ui('معطل')}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shifts">
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-5 text-primary" />{ui('إعدادات الورديات')}</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{ui('أضف أي عدد من الشيفتات وحدد المواعيد والمسؤول الأساسي لكل شيفت.')}</p><Button asChild className="w-full"><Link to="/sales/shifts">{ui('إدارة الورديات')}</Link></Button></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="size-5 text-primary" />{ui('الخزينة والعهد')}</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{ui('مصروفات الدرج، العهد، التوريد اليومي وسجل التسليم بين الشيفتات.')}</p><Button asChild variant="outline" className="w-full"><Link to="/sales/treasury">{ui('فتح إدارة الخزينة')}</Link></Button></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-primary" />{ui('تسويات الموظفين والشركاء')}</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{ui('تجميع يومي أو شهري وتسوية بالراتب أو نسبة الشريك أو الدفع المباشر.')}</p><Button asChild variant="outline" className="w-full"><Link to="/sales/settlements">{ui('فتح التسويات')}</Link></Button></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle>{ui('طرق الدفع')}</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                <Input placeholder={ui('اسم طريقة الدفع')} value={newName} onChange={(e) => setNewName(e.target.value)} />
                <select className="rounded-md border bg-background px-3 py-2 text-sm" value={newPaymentBase} onChange={(event) => setNewPaymentBase(event.target.value as typeof newPaymentBase)}><option value="cash">{ui('نقدي')}</option><option value="card">{ui('بطاقة/شبكة')}</option><option value="wallet">{ui('محفظة')}</option><option value="transfer">{ui('تحويل')}</option></select>
                <Button onClick={() => newName && createPayment.mutate(newName)} disabled={createPayment.isPending}>{ui('إضافة')}</Button>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">{ui('اختيار النوع المحاسبي مطلوب حتى يظهر الاسم المخصص في نقطة البيع ويُرحّل في التقرير بالطريقة الصحيحة.')}</p>
              <ul className="space-y-2">
                {(payments?.data ?? []).map((p: { id: number; name: string; code: string; baseMethod: string; isEnabled: boolean; fees: number }) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm">
                    <span><span className="font-medium">{p.name}</span> <span className="text-muted-foreground">({p.code})</span><span className="ms-2 rounded bg-muted px-2 py-0.5 text-xs">{p.baseMethod}</span> — {ui('عمولة')} {p.fees}%</span>
                    <label className="flex items-center gap-2"><span className={p.isEnabled ? 'text-green-600' : 'text-muted-foreground'}>{p.isEnabled ? ui('مفعّل') : ui('معطل')}</span><Switch checked={p.isEnabled} onCheckedChange={() => togglePayment.mutate(p.id)} disabled={togglePayment.isPending} /></label>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <PosInvoiceTemplatesEditor />
        </TabsContent>

        {(['reports', 'notifications'] as Tab[]).map((t) => (
          <TabsContent key={t} value={t}>
            <PosSubResource tab={t} ui={ui} />
          </TabsContent>
        ))}
      </Tabs>
    </GymSalesPageShell>
  );
}

function GeneralPosSettings({ ui }: { ui: (s: string) => string }) {
  const qc = useQueryClient();
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branch ? String(user.branch) : '');
  const effectiveBranchId = user?.branch ? String(user.branch) : selectedBranchId;
  useEffect(() => {
    if (!user?.branch && !selectedBranchId && branches[0]?.id) setSelectedBranchId(String(branches[0].id));
  }, [branches, selectedBranchId, user?.branch]);
  const { data: settings, isLoading } = useQuery({
    queryKey: ['pos-settings', 'general', effectiveBranchId],
    queryFn: async () =>
      (await api.get<PosSettingRow[]>('/pos-settings/general', { params: effectiveBranchId ? { branchId: effectiveBranchId } : undefined })).data,
    enabled: !!effectiveBranchId || !branches.length,
  });

  const [enableTax, setEnableTax] = useState(true);
  const [taxRate, setTaxRate] = useState('15');
  const [customerDiscount, setCustomerDiscount] = useState('0');
  const [employeeDiscount, setEmployeeDiscount] = useState('0');
  const [partnerDiscount, setPartnerDiscount] = useState('0');
  const [currency, setCurrency] = useState('EGP');
  const [receiptBusinessName, setReceiptBusinessName] = useState('Noamany CLUB · CAFE');
  const [receiptLogoUrl, setReceiptLogoUrl] = useState('/noamany-logo.png');
  const [receiptFooter, setReceiptFooter] = useState(ui('شكراً لزيارتكم'));

  useEffect(() => {
    if (!settings?.length) return;
    const byKey = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    setEnableTax(byKey.enable_tax !== false);
    setTaxRate(String(byKey.tax_rate ?? 15));
    setCustomerDiscount(String(byKey.default_discount_percentage ?? 0));
    setEmployeeDiscount(String(byKey.employee_discount_percentage ?? 0));
    setPartnerDiscount(String(byKey.partner_discount_percentage ?? 0));
    setCurrency(String(byKey.currency ?? 'EGP'));
    setReceiptBusinessName(String(byKey.receipt_business_name ?? 'Noamany CLUB · CAFE'));
    setReceiptLogoUrl(String(byKey.receipt_logo_url ?? '/noamany-logo.png'));
    setReceiptFooter(String(byKey.receipt_footer ?? ui('شكراً لزيارتكم')));
  }, [settings, ui]);

  const save = useMutation({
    mutationFn: async () => {
      const next: PosSettingRow[] = [
        { key: 'default_discount_percentage', value: Math.min(100, Math.max(0, Number(customerDiscount) || 0)), type: 'number' },
        { key: 'employee_discount_percentage', value: Math.min(100, Math.max(0, Number(employeeDiscount) || 0)), type: 'number' },
        { key: 'partner_discount_percentage', value: Math.min(100, Math.max(0, Number(partnerDiscount) || 0)), type: 'number' },
        { key: 'enable_tax', value: enableTax, type: 'boolean' },
        { key: 'tax_rate', value: Math.min(100, Math.max(0, Number(taxRate) || 0)), type: 'number' },
        { key: 'currency', value: currency.trim() || 'EGP', type: 'string' },
        { key: 'receipt_business_name', value: receiptBusinessName.trim() || 'Noamany CLUB · CAFE', type: 'string' },
        { key: 'receipt_logo_url', value: receiptLogoUrl.trim() || '/noamany-logo.png', type: 'string' },
        { key: 'receipt_footer', value: receiptFooter.trim() || ui('شكراً لزيارتكم'), type: 'string' },
      ];
      // Preserve any other general keys already stored.
      for (const row of settings ?? []) {
        if (!next.some((item) => item.key === row.key)) {
          next.push({ key: row.key, value: row.value, type: row.type });
        }
      }
      await api.post('/pos-settings/general', { category: 'general', branchId: effectiveBranchId ? Number(effectiveBranchId) : undefined, settings: next });
    },
    onSuccess: async () => {
      toast.success(ui('تم حفظ إعدادات نقطة البيع لهذا الفرع'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['pos-settings'] }),
        qc.invalidateQueries({ queryKey: ['pos-settings', 'general'] }),
      ]);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ui('الخصومات والضريبة والإيصال')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:max-w-sm">
          <Label>{ui('الفرع الذي تطبق عليه الإعدادات')}</Label>
          {user?.branch ? <Input value={user.branch_name || `${ui('فرع رقم')} ${user.branch}`} readOnly disabled /> : <select className="rounded-md border bg-background px-3 py-2" value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}><option value="">{ui('اختر الفرع')}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
        </div>
        <p className="text-sm text-muted-foreground">
          {ui('هذه النسبة تظهر في /sales/new كحقل «ضريبة %» وهي غير قابلة للتعديل من شاشة البيع نفسها.')}
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label>{ui('تفعيل الضريبة')}</Label>
                <p className="text-xs text-muted-foreground">{ui('عند الإيقاف تكون الضريبة 0% في نقطة البيع.')}</p>
              </div>
              <Switch checked={enableTax} onCheckedChange={setEnableTax} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 rounded-xl border bg-muted/20 p-3">
                <Label htmlFor="customerDefaultDiscount">{ui('خصم العملاء الافتراضي %')}</Label>
                <Input
                  id="customerDefaultDiscount"
                  className="nums"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={customerDiscount}
                  onChange={(e) => setCustomerDiscount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{ui('يُطبق تلقائيًا عند اختيار «عميل» في شاشة البيع، ويمكن تعديله أثناء الطلب وفق الصلاحيات.')}</p>
              </div>
              <div className="grid gap-2 rounded-xl border bg-muted/20 p-3">
                <Label htmlFor="employeeDefaultDiscount">{ui('خصم الموظفين الافتراضي %')}</Label>
                <Input
                  id="employeeDefaultDiscount"
                  className="nums"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={employeeDiscount}
                  onChange={(e) => setEmployeeDiscount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{ui('يُطبق تلقائيًا عند اختيار «موظف» ويُعتمد من إعدادات الفرع لحماية سياسة خصم الموظفين.')}</p>
              </div>
              <div className="grid gap-2 rounded-xl border bg-muted/20 p-3">
                <Label htmlFor="partnerDefaultDiscount">{ui('خصم الشركاء الافتراضي %')}</Label>
                <Input
                  id="partnerDefaultDiscount"
                  className="nums"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={partnerDiscount}
                  onChange={(e) => setPartnerDiscount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{ui('يُطبق تلقائيًا عند اختيار «شريك» في شاشة البيع، وتُحسب الضريبة على القيمة بعد الخصم.')}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <Label>{ui('نسبة الضريبة %')}</Label>
              <Input
                className="nums"
                type="number"
                min={0}
                max={100}
                step="0.01"
                disabled={!enableTax}
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <Label>{ui('العملة')}</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
            <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>{ui('اسم النشاط على الإيصال')}</Label><Input value={receiptBusinessName} onChange={(event) => setReceiptBusinessName(event.target.value)} /></div>
              <div className="grid gap-2"><Label>{ui('مسار شعار الإيصال')}</Label><Input dir="ltr" value={receiptLogoUrl} onChange={(event) => setReceiptLogoUrl(event.target.value)} placeholder="/noamany-logo.png" /></div>
              <div className="grid gap-2 sm:col-span-2"><Label>{ui('رسالة نهاية الإيصال')}</Label><Input value={receiptFooter} onChange={(event) => setReceiptFooter(event.target.value)} /></div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending || (!effectiveBranchId && branches.length > 0)}>
              {ui('حفظ')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PosSubResource({ tab, ui }: { tab: Tab; ui: (s: string) => string }) {
  const endpoints: Record<string, string> = {
    invoices: '/pos-invoice-templates',
    reports: '/pos-report-templates',
    notifications: '/pos-notification-rules',
  };
  const { data } = useQuery({
    queryKey: [endpoints[tab]],
    queryFn: async () => (await api.get(endpoints[tab], { params: { pageSize: 50 } })).data,
  });

  return (
    <Card>
      <CardContent className="pt-4">
        <ul className="space-y-2">
          {(data?.data ?? []).map((item: { id: number; name: string; isActive?: boolean; isEnabled?: boolean }) => (
            <li key={item.id} className="flex justify-between rounded border p-2 text-sm">
              <span>{item.name}</span>
              <span>{(item.isActive ?? item.isEnabled) ? ui('نشط') : ui('معطل')}</span>
            </li>
          ))}
          {(data?.data ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">{ui('لا توجد سجلات')}</p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
