import { receiptLogoUrl as resolveReceiptLogoUrl } from '@/lib/receipt-brand';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import { PosInvoiceTemplatesEditor } from '@/components/sales/pos-invoice-templates-editor';
import { PosPaymentMethodsEditor } from '@/components/sales/pos-payment-methods-editor';
import { usePermission } from '@/hooks/use-permission';
import { toggleAllCategoryIds } from './employee-benefit-category-selection';

type Tab = 'devices' | 'payments' | 'invoices' | 'reports' | 'notifications' | 'settings' | 'shifts';

type PosSettingRow = { key: string; value: unknown; type?: string; description?: string };

export function PosAdminPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('gym-sales.sales.pos_admin:create');
  const canUpdate = can('gym-sales.sales.pos_admin:update');
  const canConfigure = can('gym-sales.sales.pos_admin:configure');
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('settings');
  const [newName, setNewName] = useState('');

  const { data: devices } = useQuery({
    queryKey: ['pos-devices'],
    queryFn: async () => (await api.get('/pos-devices', { params: { pageSize: 100 } })).data,
    enabled: tab === 'devices',
  });

  const createDevice = useMutation({
    mutationFn: (name: string) => canCreate
      ? api.post('/pos-devices', { name, deviceType: 'terminal' })
      : Promise.reject(new Error('غير مصرح')),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos-devices'] }); setNewName(''); },
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
          <GeneralPosSettings ui={ui} canConfigure={canConfigure} />
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader><CardTitle>{ui('أجهزة POS')}</CardTitle></CardHeader>
            <CardContent>
              {canCreate ? <div className="mb-4 flex gap-2">
                <Input placeholder={ui('اسم الجهاز')} value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Button onClick={() => newName && createDevice.mutate(newName)} disabled={createDevice.isPending}>{ui('إضافة')}</Button>
              </div> : null}
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
            {can('gym-sales.sales.shifts:view') ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-5 text-primary" />{ui('إعدادات الورديات')}</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{ui('أضف أي عدد من الشيفتات وحدد المواعيد والمسؤول الأساسي لكل شيفت.')}</p><Button asChild className="w-full"><Link to="/sales/shifts">{ui('إدارة الورديات')}</Link></Button></CardContent></Card> : null}
            {can('gym-sales.sales.treasury:view') ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="size-5 text-primary" />{ui('الخزينة والعهد')}</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{ui('مصروفات الدرج، العهد، التوريد اليومي وسجل التسليم بين الشيفتات.')}</p><Button asChild variant="outline" className="w-full"><Link to="/sales/treasury">{ui('فتح إدارة الخزينة')}</Link></Button></CardContent></Card> : null}
            {can('gym-sales.sales.settlements:view') ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-primary" />{ui('تسويات الموظفين والشركاء')}</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{ui('تجميع يومي أو شهري وتسوية بالراتب أو نسبة الشريك أو الدفع المباشر.')}</p><Button asChild variant="outline" className="w-full"><Link to="/sales/settlements">{ui('فتح التسويات')}</Link></Button></CardContent></Card> : null}
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <PosPaymentMethodsEditor ui={ui} canCreate={canCreate} canUpdate={canUpdate} />
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

function GeneralPosSettings({ ui, canConfigure }: { ui: (s: string) => string; canConfigure: boolean }) {
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
  const [inventoryTrackingEnabled, setInventoryTrackingEnabled] = useState(true);
  const [taxRate, setTaxRate] = useState('15');
  const [customerDiscount, setCustomerDiscount] = useState('0');
  const [employeeDiscount, setEmployeeDiscount] = useState('0');
  const [employeeDiscountEnabled, setEmployeeDiscountEnabled] = useState(true);
  const [freeDrinksEnabled, setFreeDrinksEnabled] = useState(false);
  const [freeDrinksDaily, setFreeDrinksDaily] = useState('1');
  const [freeCategories, setFreeCategories] = useState<number[]>([]);
  const [touchKeypad, setTouchKeypad] = useState(false);
  const { data: drinkCategories = [] } = useQuery({
    queryKey: ['cafe-categories', 'employee-benefits'],
    queryFn: async () => {
      const { data } = await api.get('/categories');
      return ((Array.isArray(data) ? data : data.data) as Array<{ id: number; nameAr: string }>).map((row) => ({ id: row.id, name: row.nameAr }));
    },
  });
  const [partnerDiscount, setPartnerDiscount] = useState('0');
  const [currency, setCurrency] = useState('EGP');
  const [receiptBusinessName, setReceiptBusinessName] = useState('NOAMANY · CAFE');
  const [receiptLogoUrl, setReceiptLogoUrl] = useState('/noamany-logo.png');
  const [receiptFooter, setReceiptFooter] = useState(ui('شكراً لزيارتكم'));
  const drinkCategoryIds = drinkCategories.map((category) => category.id);
  const allDrinkCategoriesSelected = drinkCategoryIds.length > 0
    && drinkCategoryIds.every((id) => freeCategories.includes(id));
  const someDrinkCategoriesSelected = drinkCategoryIds.some((id) => freeCategories.includes(id));

  useEffect(() => {
    if (!settings?.length) return;
    const byKey = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    setEnableTax(byKey.enable_tax !== false);
    setInventoryTrackingEnabled(byKey.inventory_tracking_enabled !== false);
    setTaxRate(String(byKey.tax_rate ?? 15));
    setCustomerDiscount(String(byKey.default_discount_percentage ?? 0));
    setEmployeeDiscount(String(byKey.employee_discount_percentage ?? 0));
    setEmployeeDiscountEnabled(byKey.employee_discount_enabled !== false);
    setFreeDrinksEnabled(byKey.employee_free_drinks_enabled === true);
    setFreeDrinksDaily(String(byKey.employee_free_drinks_daily ?? 1));
    setFreeCategories(Array.isArray(byKey.employee_free_drink_categories) ? byKey.employee_free_drink_categories.map(Number) : []);
    setTouchKeypad(byKey.touch_keypad_enabled === true);
    setPartnerDiscount(String(byKey.partner_discount_percentage ?? 0));
    setCurrency(String(byKey.currency ?? 'EGP'));
    setReceiptBusinessName(String(byKey.receipt_business_name ?? 'NOAMANY · CAFE'));
    setReceiptLogoUrl(resolveReceiptLogoUrl(String(byKey.receipt_logo_url ?? '/noamany-logo.png')));
    setReceiptFooter(String(byKey.receipt_footer ?? ui('شكراً لزيارتكم')));
  }, [settings, ui]);

  const save = useMutation({
    mutationFn: async () => {
      if (!canConfigure) throw new Error('غير مصرح');
      if (freeDrinksEnabled && (!freeCategories.length || !Number.isInteger(Number(freeDrinksDaily)) || Number(freeDrinksDaily) < 1 || Number(freeDrinksDaily) > 100)) {
        throw new Error(ui('حدد أقسام المشروبات وعددًا صحيحًا من 1 إلى 100 لكل موظف يوميًا'));
      }
      const next: PosSettingRow[] = [
        { key: 'employee_discount_enabled', value: employeeDiscountEnabled, type: 'boolean' },
        { key: 'employee_free_drinks_enabled', value: freeDrinksEnabled, type: 'boolean' },
        { key: 'employee_free_drinks_daily', value: Number(freeDrinksDaily) || 1, type: 'number' },
        { key: 'employee_free_drink_categories', value: freeCategories, type: 'json' },
        { key: 'touch_keypad_enabled', value: touchKeypad, type: 'boolean' },
        { key: 'default_discount_percentage', value: Math.min(100, Math.max(0, Number(customerDiscount) || 0)), type: 'number' },
        { key: 'employee_discount_percentage', value: Math.min(100, Math.max(0, Number(employeeDiscount) || 0)), type: 'number' },
        { key: 'partner_discount_percentage', value: Math.min(100, Math.max(0, Number(partnerDiscount) || 0)), type: 'number' },
        { key: 'enable_tax', value: enableTax, type: 'boolean' },
        { key: 'inventory_tracking_enabled', value: inventoryTrackingEnabled, type: 'boolean' },
        { key: 'tax_rate', value: Math.min(100, Math.max(0, Number(taxRate) || 0)), type: 'number' },
        { key: 'currency', value: currency.trim() || 'EGP', type: 'string' },
        { key: 'receipt_business_name', value: receiptBusinessName.trim() || 'NOAMANY · CAFE', type: 'string' },
        { key: 'receipt_logo_url', value: resolveReceiptLogoUrl(receiptLogoUrl), type: 'string' },
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
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div>
                <Label>{ui('ربط الكاشير بالمخزون')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {inventoryTrackingEnabled
                    ? ui('كاشير + مخزن: كل طلب يخصم مكونات الـRecipe والمنتجات الجاهزة فورًا.')
                    : ui('كاشير فقط: البيع والتكلفة والتقارير تعمل، بدون فحص أو خصم أي رصيد مخزني.')}
                </p>
              </div>
              {canConfigure ? <Switch checked={inventoryTrackingEnabled} onCheckedChange={setInventoryTrackingEnabled} /> : null}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label>{ui('تفعيل الضريبة')}</Label>
                <p className="text-xs text-muted-foreground">{ui('عند الإيقاف تكون الضريبة 0% في نقطة البيع.')}</p>
              </div>
              {canConfigure ? <Switch checked={enableTax} onCheckedChange={setEnableTax} /> : null}
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
                <label className="flex min-h-11 items-center gap-3 font-semibold"><Checkbox disabled={!canConfigure} checked={employeeDiscountEnabled} onCheckedChange={(checked) => setEmployeeDiscountEnabled(checked === true)} />{ui('تفعيل خصم الموظف')}</label>
                {employeeDiscountEnabled && <><Label htmlFor="employeeDefaultDiscount">{ui('نسبة الخصم %')}</Label><Input
                  id="employeeDefaultDiscount"
                  className="nums"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={employeeDiscount}
                  onChange={(e) => setEmployeeDiscount(e.target.value)}
                /></>}
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
            <section className="space-y-3 rounded-xl border p-4">
              <label className="flex min-h-11 items-center gap-3 font-semibold"><Checkbox disabled={!canConfigure} checked={freeDrinksEnabled} onCheckedChange={(checked) => setFreeDrinksEnabled(checked === true)} />{ui('مشروبات مجانية للموظف')}</label>
              <p className="text-sm text-muted-foreground">{ui('رصيد يومي لكل موظف يتجدد عند منتصف الليل بتوقيت القاهرة، ولا يتجدد بتغيير الوردية. يمكن تفعيله مع الخصم؛ الخصم على المشروبات المدفوعة فقط.')}</p>
              {freeDrinksEnabled && <div className="space-y-3">
                <div className="grid max-w-xs gap-2"><Label htmlFor="freeDrinksDaily">{ui('عدد المشروبات لكل موظف يوميًا')}</Label><Input id="freeDrinksDaily" type="number" min={1} max={100} step={1} value={freeDrinksDaily} onChange={(e) => setFreeDrinksDaily(e.target.value)} /></div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{ui('أقسام المشروبات المشمولة')}</p>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-muted/60 focus-within:ring-2 focus-within:ring-ring">
                    <Checkbox
                      checked={allDrinkCategoriesSelected ? true : someDrinkCategoriesSelected ? 'indeterminate' : false}
                      disabled={!canConfigure || !drinkCategoryIds.length}
                      onCheckedChange={() => setFreeCategories((ids) => toggleAllCategoryIds(drinkCategoryIds, ids))}
                    />
                    <span>{ui(allDrinkCategoriesSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل')}</span>
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{drinkCategories.map((category) => <label key={category.id} className="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2"><Checkbox disabled={!canConfigure} checked={freeCategories.includes(category.id)} onCheckedChange={(checked) => setFreeCategories((ids) => checked === true ? [...ids, category.id] : ids.filter((id) => id !== category.id))} /><span>{category.name}</span></label>)}</div>
                {!freeCategories.length && <p className="text-sm text-amber-800 dark:text-amber-200">{ui('اختر قسمًا واحدًا على الأقل؛ المنتجات خارج هذه الأقسام تُحاسب بالسعر المعتاد.')}</p>}
                <p className="text-sm text-muted-foreground">{ui('المجاني يُطبق حسب ترتيب إضافة المشروبات للسلة. الفاتورة المعلقة تحجز الرصيد؛ إلغاؤها يعيده. الاسترداد بعد التحضير لا يجدد الرصيد.')}</p>
              </div>}
            </section>
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div><Label htmlFor="touchKeypad">{ui('تفعيل لوحة الأرقام باللمس')}</Label><p className="mt-1 text-sm text-muted-foreground">{ui('تفتح عند لمس المبالغ والكميات وتغلق بالضغط خارجها. مناسبة للتابلت وتعمل في نوافذ الورديات أيضًا.')}</p></div>
              <Switch disabled={!canConfigure} id="touchKeypad" checked={touchKeypad} onCheckedChange={setTouchKeypad} />
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
            {canConfigure ? <Button permissionResource="gym-sales.sales.pos_admin" permissionAction="configure" onClick={() => save.mutate()} disabled={save.isPending || (!effectiveBranchId && branches.length > 0)}>
              {ui('حفظ')}
            </Button> : null}
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
