import { receiptLogoUrl } from '@/lib/receipt-brand';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, FileText, HandCoins, Landmark, Printer, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildShiftCloseHtml, type ShiftCloseReportData } from '@/lib/shift-close-print';

interface PosSettingRow { key: string; value: unknown }

const money = (value: number) => `${toArabicDigits(value.toFixed(2))} ج.م`;

const paymentIcon = (baseMethod: string) => {
  if (baseMethod === 'cash') return Banknote;
  if (baseMethod === 'transfer') return Landmark;
  if (baseMethod === 'wallet') return WalletCards;
  return CreditCard;
};

const paymentLabel = (method: string | null) => {
  if (method === 'cash') return 'كاش';
  if (method === 'card') return 'بطاقة / فيزا';
  if (method === 'wallet') return 'محفظة إلكترونية';
  if (method === 'transfer') return 'تحويل بنكي';
  return method || '—';
};

const settlementLabel = (method: string, paymentMethod: string | null) => {
  if (method === 'payroll_deduction') return 'خصم من الراتب';
  if (method === 'profit_share_deduction') return 'خصم من نسبة الشريك';
  return `دفع مباشر · ${paymentLabel(paymentMethod)}`;
};


export function ShiftCloseReceiptDialog({
  sessionId,
  open,
  onOpenChange,
  canPrint,
  ui,
}: {
  sessionId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canPrint: boolean;
  ui: (text: string) => string;
}) {
  const [activeView, setActiveView] = useState<'summary' | 'receipt'>('summary');
  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ['shift-close-report', sessionId],
    queryFn: async () => (await api.get<ShiftCloseReportData>(`/shift-sessions/${sessionId}/close-report`)).data,
    enabled: open && sessionId != null,
  });
  const { data: settings = [] } = useQuery({
    queryKey: ['pos-settings', 'general', report?.session.branchId],
    queryFn: async () => (await api.get<PosSettingRow[]>('/pos-settings/general', {
      params: report?.session.branchId ? { branchId: report.session.branchId } : undefined,
    })).data,
    enabled: open && report != null,
  });
  const businessName = useMemo(() => String(
    settings.find((setting) => setting.key === 'receipt_business_name')?.value
      || report?.session.branchName
      || 'NOAMANY · CAFE',
  ), [report?.session.branchName, settings]);
  const logoUrl = useMemo(() => receiptLogoUrl(String(
    settings.find((setting) => setting.key === 'receipt_logo_url')?.value
      || '/noamany-logo.png',
  )), [settings]);
  const printHtml = useMemo(
    () => (report ? buildShiftCloseHtml(report, businessName, logoUrl) : ''),
    [businessName, logoUrl, report],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setActiveView('summary');
    onOpenChange(nextOpen);
  };

  const print = () => {
    if (!report || !canPrint) return;
    const target = window.open('', '_blank', 'width=420,height=760');
    if (!target) return;
    target.document.open();
    target.document.write(printHtml);
    target.document.close();
    target.focus();
    let printStarted = false;
    const startPrint = () => {
      if (printStarted || target.closed) return;
      printStarted = true;
      target.focus();
      target.print();
    };
    const pendingImages = Array.from(target.document.images)
      .filter((image) => !image.complete);
    if (pendingImages.length === 0) {
      window.setTimeout(startPrint, 180);
      return;
    }
    Promise.all(pendingImages.map((image) => new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    }))).then(() => window.setTimeout(startPrint, 80));
    window.setTimeout(startPrint, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="xl" className="max-h-[92dvh] overflow-y-auto p-0">
        <DialogHeader className="border-b bg-gradient-to-l from-primary/[0.08] to-background px-6 py-5 text-start">
          <DialogTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-primary" />{ui('ملخص إغلاق الوردية')}</DialogTitle>
          <DialogDescription>{ui('تجميعة واحدة مطابقة للتحصيل، جاهزة للمراجعة والطباعة من برنتر الكاشير')}</DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="px-5 pt-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label={ui('عرض تقرير الوردية')}>
              <Button
                type="button"
                variant={activeView === 'summary' ? 'default' : 'ghost'}
                className="h-11 rounded-lg"
                role="tab"
                aria-selected={activeView === 'summary'}
                onClick={() => setActiveView('summary')}
              >
                <FileText className="size-4" />
                {ui('ملخص الوردية')}
              </Button>
              <Button
                type="button"
                variant={activeView === 'receipt' ? 'default' : 'ghost'}
                className="h-11 rounded-lg"
                role="tab"
                aria-selected={activeView === 'receipt'}
                onClick={() => setActiveView('receipt')}
              >
                <ReceiptText className="size-4" />
                {ui('معاينة إيصال 80mm')}
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? <div className="p-12 text-center text-sm text-muted-foreground">{ui('جاري تجهيز تقرير الوردية…')}</div> : isError ? (
          <div className="p-8 text-center"><p className="text-sm text-destructive">{ui('تعذر تحميل التقرير')}</p><Button variant="outline" className="mt-3" onClick={() => void refetch()}>{ui('إعادة المحاولة')}</Button></div>
        ) : report && activeView === 'receipt' ? (
          <div className="px-5 pb-5 pt-3">
            <section className="rounded-2xl bg-muted/50 p-4 sm:p-6" aria-label={ui('معاينة الإيصال الحراري')}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black">{ui('شكل الإيصال عند الطباعة')}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{ui('نفس المحتوى الذي سيخرج من برنتر الكاشير الحراري')}</p>
                </div>
                <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-muted-foreground shadow-sm">80mm</span>
              </div>
              <div className="overflow-x-auto pb-2">
                <iframe
                  title={ui('معاينة تقرير إغلاق الوردية مقاس 80mm')}
                  srcDoc={printHtml}
                  sandbox=""
                  className="mx-auto block h-[190mm] w-[80mm] max-w-full bg-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
                />
              </div>
            </section>
          </div>
        ) : report ? (
          <div className="space-y-5 p-5">
            <section className="rounded-3xl border bg-foreground p-5 text-background shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs opacity-65">{businessName}</p><h3 className="mt-1 text-xl font-black">{report.session.shiftName}</h3><p className="mt-1 text-xs opacity-70">{report.session.branchName || ui('بدون فرع')} · {report.session.cashierName || ui('غير محدد')}</p></div>
                <div className="text-end"><p className="nums text-xs opacity-65">#{toArabicDigits(report.session.id)}</p><p className="nums mt-1 font-black">{toArabicDigits(report.session.sessionDate)}</p><span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-black ${report.session.status === 'open' ? 'bg-amber-300 text-amber-950' : 'bg-emerald-300 text-emerald-950'}`}>{ui(report.session.status === 'open' ? 'وردية مفتوحة' : 'وردية مغلقة')}</span></div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Summary label={ui('الفواتير')} value={toArabicDigits(report.counts.invoices)} />
                <Summary label={ui('إجمالي المبيعات')} value={money(report.totals.grossSales)} />
                <Summary label={ui('المحصل')} value={money(report.totals.collected)} />
                <Summary label={ui('صافي المبيعات')} value={money(report.totals.netSales)} strong />
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-black">{ui('تفصيل طرق الدفع')}</h3><span className="text-xs text-muted-foreground">{ui('العدد والصافي لكل وسيلة')}</span></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {report.paymentMethods.map((method) => {
                  const Icon = paymentIcon(method.baseMethod);
                  return <article key={method.code} className="rounded-2xl border bg-background p-4 shadow-sm"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span><div className="min-w-0"><h4 className="truncate font-black">{method.name}</h4><p className="text-[11px] text-muted-foreground">{toArabicDigits(method.saleCount)} {ui('عملية')}</p></div></div><p className="nums mt-4 text-2xl font-black">{money(method.netAmount)}</p>{method.refundCount || method.cancellationCount ? <p className="mt-1 text-[11px] text-rose-600">{ui('مرتجع/ملغي')}: {money(method.refundAmount + method.cancellationAmount)}</p> : null}</article>;
                })}
                {report.internalAccounts.netAmount !== 0 ? <article className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/20"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-700"><FileText className="size-5" /></span><div><h4 className="font-black">{report.internalAccounts.name}</h4><p className="text-[11px] text-muted-foreground">{toArabicDigits(report.internalAccounts.saleCount)} {ui('فاتورة على الحساب')}</p></div></div><p className="nums mt-4 text-2xl font-black text-sky-800 dark:text-sky-200">{money(report.internalAccounts.netAmount)}</p></article> : null}
              </div>
            </section>

            {report.accountSettlements?.count ? (
              <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/15">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-100/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-emerald-600 text-white">
                      <HandCoins className="size-5" />
                    </span>
                    <div>
                      <h3 className="font-black">{ui('تحصيلات حسابات الموظفين والشركاء')}</h3>
                      <p className="mt-0.5 text-xs text-emerald-900/70 dark:text-emerald-100/70">
                        {toArabicDigits(report.accountSettlements.count)} {ui('تسوية مسجلة على هذه الوردية')}
                      </p>
                    </div>
                  </div>
                  <p className="nums text-lg font-black text-emerald-800 dark:text-emerald-200">
                    {money(report.accountSettlements.totalAmount)}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-background/70 text-muted-foreground">
                      <tr>
                        <th className="p-3 text-start">{ui('كشف الحساب')}</th>
                        <th className="p-3 text-start">{ui('الموظف / الشريك')}</th>
                        <th className="p-3 text-start">{ui('طريقة التسوية')}</th>
                        <th className="p-3 text-start">{ui('الوقت')}</th>
                        <th className="p-3 text-end">{ui('المبلغ')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.accountSettlements.entries.map((settlement) => (
                        <tr key={settlement.statementNumber} className="border-t border-emerald-200/70 bg-background/50 dark:border-emerald-900/70">
                          <td className="nums max-w-[190px] break-all p-3 font-bold">{settlement.statementNumber}</td>
                          <td className="p-3 font-semibold">{settlement.accountName || ui(settlement.accountType === 'partner' ? 'شريك' : 'موظف')}</td>
                          <td className="p-3"><Badge variant="outline" className="whitespace-nowrap bg-background">{ui(settlementLabel(settlement.settlementMethod, settlement.paymentMethod))}</Badge></td>
                          <td className="nums p-3">{settlement.settledAt ? new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date(settlement.settledAt)) : '—'}</td>
                          <td className="nums p-3 text-end font-black">{money(settlement.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border p-4"><h3 className="flex items-center gap-2 font-black"><ShieldCheck className="size-4 text-emerald-600" />{ui('مطابقة الدرج')}</h3><dl className="mt-3 space-y-2 text-sm"><Row label={ui('رصيد الافتتاح')} value={money(report.drawer.openingBalance)} /><Row label={ui('المتوقع في الدرج')} value={money(report.drawer.expectedClosingBalance)} /><Row label={ui('النقدي الفعلي')} value={report.drawer.closingBalance == null ? ui('لم يُدخل بعد') : money(report.drawer.closingBalance)} /><Row label={ui('فرق النقدية')} value={report.drawer.cashDifference == null ? '—' : money(report.drawer.cashDifference)} danger={(report.drawer.cashDifference ?? 0) !== 0} /></dl></div>
              <div className="rounded-2xl border p-4"><h3 className="font-black">{ui('الإجماليات المالية')}</h3><dl className="mt-3 space-y-2 text-sm"><Row label={ui('الخصومات')} value={money(report.totals.discount)} /><Row label={ui('الضريبة')} value={money(report.totals.tax)} /><Row label={ui('المرتجعات')} value={money(report.totals.refunds)} /><Row label={ui('الإلغاءات')} value={money(report.totals.cancellations)} /></dl></div>
            </section>
          </div>
        ) : null}

        <DialogFooter className="border-t bg-muted/20 px-5 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>{ui('إغلاق')}</Button>
          {canPrint ? <Button onClick={print} disabled={!report}><Printer className="size-4" />{ui('طباعة تقرير الوردية')}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] opacity-65">{label}</p><p className={`nums mt-1 ${strong ? 'text-lg font-black text-amber-300' : 'font-bold'}`}>{value}</p></div>;
}

function Row({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className={`nums font-black ${danger ? 'text-destructive' : ''}`}>{value}</dd></div>;
}
