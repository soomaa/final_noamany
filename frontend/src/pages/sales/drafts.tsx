import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Clock3, Coffee, FileClock, MessageSquareText, Pencil, ReceiptText, RotateCcw, Star, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { formatTime } from '@/lib/formatters';
import { confirm } from '@/lib/confirm';
import { confirmWithPreview } from '@/lib/confirm';
import { usePermission } from '@/hooks/use-permission';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import { toArabicDigits } from '@/lib/utils';
import type { QuickSaleRow } from '@/types/gym-sales';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';

interface ItemFeedbackDraft {
  rating: number;
  comment: string;
}

interface ReversalDraft {
  invoice: QuickSaleRow;
  status: 'refunded' | 'cancelled';
  notes: string;
}

interface ShiftBoardSession {
  id: number;
  shiftId: number;
  shiftName: string;
  color?: string | null;
  status: string;
  sessionDate: string;
  startTime: string;
  endTime?: string | null;
  isOpen: boolean;
  invoices: QuickSaleRow[];
  drafts: QuickSaleRow[];
  completedCount: number;
  completedValue: number;
}

interface ShiftBoardResponse {
  sessions: ShiftBoardSession[];
  totals: {
    orders: number;
    completed: number;
    value: number;
    held: number;
    drafts: number;
  };
}

export function SalesDraftsPage() {
  const { ui, locale } = useLocale();
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const user = useAuth((state) => state.user);
  const { data: branches } = useBranches();
  const [selected, setSelected] = useState<QuickSaleRow | null>(null);
  const [itemFeedback, setItemFeedback] = useState<Record<number, ItemFeedbackDraft>>({});
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [reversal, setReversal] = useState<ReversalDraft | null>(null);
  const [reversing, setReversing] = useState(false);

  const effectiveBranchId = useMemo(() => {
    if (user?.branch && user.branch > 0) return String(user.branch);
    return String(branches?.[0]?.id ?? '');
  }, [user?.branch, branches]);

  const { data, isLoading } = useQuery({
    queryKey: ['quick-sales', 'shift-board', effectiveBranchId],
    queryFn: async () => {
      const { data: board } = await api.get<ShiftBoardResponse>('/quick-sales/shift-board', {
        params: {
          branchId: effectiveBranchId || undefined,
          limit: 2,
        },
      });
      return board;
    },
    enabled: !!effectiveBranchId,
    refetchInterval: 30_000,
  });

  const sessions = data?.sessions ?? [];
  const totals = data?.totals ?? { orders: 0, completed: 0, value: 0, held: 0, drafts: 0 };
  const drafts = useMemo(
    () => sessions.flatMap((session) => session.drafts),
    [sessions],
  );

  const openInvoice = (invoice: QuickSaleRow) => {
    setSelected(invoice);
    setItemFeedback(Object.fromEntries((invoice.items ?? []).map((item) => [
      item.id,
      { rating: item.feedback?.rating ?? 0, comment: item.feedback?.comment ?? '' },
    ])));
  };

  const cancelDraft = async (draft: QuickSaleRow) => {
    const accepted = await confirm({
      title: ui('إلغاء الفاتورة المعلقة'),
      description: ui('سيتم إرجاع كل المكونات المحجوزة إلى المخزون وتسجيل حركة الإلغاء.'),
      confirmLabel: ui('إلغاء وإرجاع المخزون'),
      variant: 'destructive',
    });
    if (!accepted) return;
    try {
      await api.post(`/quick-sales/${draft.id}/cancel-draft`, { notes: ui('ألغيت من شاشة فواتير الورديات') });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quick-sales'] }),
        queryClient.invalidateQueries({ queryKey: ['cafe-products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
      toast.success(ui('تم إلغاء الفاتورة وإرجاع المخزون بالكامل'));
    } catch (error) { toast.error(apiError(error)); }
  };

  const saveItemFeedback = async () => {
    if (!selected) return;
    const items = (selected.items ?? []).map((item) => ({
      itemId: item.id,
      rating: itemFeedback[item.id]?.rating ?? 0,
      comment: itemFeedback[item.id]?.comment.trim() || undefined,
    })).filter((item) => item.rating >= 1);
    if (!items.length) {
      toast.error(ui('اختر تقييمًا لصنف واحد على الأقل'));
      return;
    }
    setSavingFeedback(true);
    try {
      const { data: updated } = await api.put<QuickSaleRow>(`/quick-sales/${selected.id}/item-feedback`, { items });
      setSelected(updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quick-sales'] }),
        queryClient.invalidateQueries({ queryKey: ['cafe-item-feedback-report'] }),
      ]);
      toast.success(ui('تم حفظ تقييم كل الأصناف'));
    } catch (error) { toast.error(apiError(error)); }
    finally { setSavingFeedback(false); }
  };

  const reverseCompletedInvoice = async () => {
    if (!reversal || reversal.notes.trim().length < 3) {
      toast.error(ui('اكتب سببًا واضحًا للإلغاء أو الاسترداد'));
      return;
    }
    const endpoint = reversal.status === 'refunded'
      ? `/quick-sales/${reversal.invoice.id}/refund`
      : `/quick-sales/${reversal.invoice.id}/cancel-completed`;
    const label = reversal.status === 'refunded' ? ui('استرداد الفاتورة') : ui('إلغاء الفاتورة');
    setReversing(true);
    try {
      await confirmWithPreview(
        {
          title: label,
          description: ui('راجع أثر العملية قبل تنفيذها. لا يمكن التراجع عنها تلقائيًا.'),
          confirmLabel: label,
          variant: 'destructive',
        },
        async () => {
          const { data: preview } = await api.post(`${endpoint}?dryRun=true`, { notes: reversal.notes.trim() });
          return {
            rows: preview.rows ?? [],
            warning: preview.warning,
          };
        },
        async () => {
          await api.post(endpoint, { notes: reversal.notes.trim() });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['quick-sales'] }),
            queryClient.invalidateQueries({ queryKey: ['cafe-products'] }),
            queryClient.invalidateQueries({ queryKey: ['inventory-dashboard'] }),
            queryClient.invalidateQueries({ queryKey: ['inventory'] }),
            queryClient.invalidateQueries({ queryKey: ['cafe-reports'] }),
          ]);
          setSelected(null);
          setReversal(null);
          toast.success(reversal.status === 'refunded'
            ? ui('تم الاسترداد: عاد الجاهز للمخزون وسُجلت خامات المنتجات المُحضّرة هالكًا')
            : ui('تم إلغاء الفاتورة وعكس المخزون والتحصيل بالكامل'));
        },
      );
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setReversing(false);
    }
  };

  return (
    <GymSalesPageShell
      section="sales"
      title={ui('فواتير الورديات')}
      description={ui('تظهر فواتير آخر ورديتين فقط — الحالية والسابقة — مفصولة بسكاشن بدون مسح الصفحة عند منتصف الليل')}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ReceiptText} label={ui('فواتير آخر ورديتين')} value={toArabicDigits(totals.orders)} tone="primary" />
        <Metric icon={Clock3} label={ui('فواتير معلقة')} value={toArabicDigits(totals.drafts)} tone="amber" />
        <Metric icon={Coffee} label={ui('فواتير مكتملة')} value={toArabicDigits(totals.completed)} tone="emerald" />
        <Metric icon={ReceiptText} label={ui('إيراد النافذة')} value={`${toArabicDigits(totals.value.toFixed(2))} ج.م`} tone="primary" />
      </div>

      <Card className="overflow-hidden border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10">
        <CardHeader className="border-b border-amber-200/70 bg-amber-100/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><FileClock className="size-5 text-amber-600" />{ui('الفواتير المعلقة')}</span>
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">{toArabicDigits(drafts.length)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : drafts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-300/70 p-8 text-center text-sm text-muted-foreground">{ui('لا توجد فواتير معلقة الآن')}</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {drafts.map((draft) => (
                <div key={draft.id} className="rounded-2xl border border-amber-300 bg-background p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="nums text-lg font-black">#{toArabicDigits(draft.dailyNumber)}</p>
                      <p className="text-sm font-medium">{draft.customerName}</p>
                      <p className="nums text-xs text-muted-foreground">{formatTime(draft.saleTime, locale)}</p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{ui('معلقة')}</Badge>
                  </div>
                  <div className="my-3 grid grid-cols-2 gap-2 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
                    <span>{toArabicDigits((draft.items ?? []).length)} {ui('صنف')}</span>
                    <span className="nums text-end font-bold">{toArabicDigits(draft.totalAmount.toFixed(2))} ج.م</span>
                  </div>
                  {draft.receiptComment && (
                    <div className="mb-3 flex gap-2 rounded-xl bg-muted/60 p-3 text-sm">
                      <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" />
                      <p className="line-clamp-2">{draft.receiptComment}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {can('gym-sales.sales.drafts:update') || can('gym-sales.sales.new_receipt:update') ? (
                      <>
                        <Button asChild className="flex-1">
                          <Link to={`/sales/new?draftId=${draft.id}`}>
                            <Pencil className="me-1 size-4" />{ui('فتح وتعديل')}
                          </Link>
                        </Button>
                        <Button
                          aria-label={ui('إلغاء الفاتورة المعلقة وإرجاع المخزون')}
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => void cancelDraft(draft)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="outline" className="flex-1" onClick={() => openInvoice(draft)}>
                        <ReceiptText className="size-4" />{ui('عرض التفاصيل')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className="p-5 text-sm text-muted-foreground">{ui('جاري التحميل…')}</CardContent></Card>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            {ui('لا توجد ورديات بعد. افتح وردية من نقطة البيع لتظهر فواتيرها هنا.')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((session, index) => {
            const posted = session.invoices.filter((row) => row.status !== 'draft');
            return (
              <Card key={session.id} className="overflow-hidden">
                <CardHeader className="border-b bg-muted/30">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{ backgroundColor: session.color || 'hsl(var(--primary))' }}
                      />
                      <span>{session.shiftName}</span>
                      {session.isOpen ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{ui('الوردية الحالية')}</Badge>
                      ) : (
                        <Badge variant="secondary">{ui('الوردية السابقة')}</Badge>
                      )}
                      {index === 0 && sessions.length === 2 ? (
                        <span className="text-xs font-normal text-muted-foreground">{ui('عند فتح وردية جديدة تبقى هذه والسابقة فقط')}</span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm font-normal text-muted-foreground">
                      <span className="nums">{session.sessionDate}</span>
                      <span>·</span>
                      <span className="nums">{formatTime(session.startTime, locale)}</span>
                      {session.endTime ? <span className="nums">— {formatTime(session.endTime, locale)}</span> : null}
                      <Badge variant="outline">{toArabicDigits(posted.length)} {ui('فاتورة')}</Badge>
                      <Badge variant="outline" className="nums">{toArabicDigits(session.completedValue.toFixed(2))} ج.م</Badge>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {posted.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">{ui('لا توجد فواتير مكتملة في هذه الوردية بعد')}</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60 text-muted-foreground">
                          <tr>
                            <th className="p-3 text-start">{ui('رقم اليوم')}</th>
                            <th className="p-3 text-start">{ui('الوقت')}</th>
                            <th className="p-3 text-start">{ui('العميل')}</th>
                            <th className="p-3 text-center">{ui('الأصناف')}</th>
                            <th className="p-3 text-center">{ui('الحالة')}</th>
                            <th className="p-3 text-end">{ui('الإجمالي')}</th>
                            <th className="p-3 text-end">{ui('التفاصيل والتقييم')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posted.map((invoice) => (
                            <tr key={invoice.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="nums p-3 text-lg font-black text-primary">#{toArabicDigits(invoice.dailyNumber)}</td>
                              <td className="nums p-3">{formatTime(invoice.saleTime, locale)}</td>
                              <td className="p-3 font-medium">{invoice.customerName}</td>
                              <td className="nums p-3 text-center">{toArabicDigits((invoice.items ?? []).length)}</td>
                              <td className="p-3 text-center"><InvoiceStatus status={invoice.status} /></td>
                              <td className="nums p-3 text-end font-bold">{toArabicDigits(invoice.totalAmount.toFixed(2))} ج.م</td>
                              <td className="p-3 text-end">
                                <Button variant="outline" size="sm" onClick={() => openInvoice(invoice)}>
                                  <ReceiptText className="size-4" />{ui('فتح الفاتورة')}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent size="xl" className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>{ui('فاتورة')} <span className="nums text-primary">#{toArabicDigits(selected?.dailyNumber ?? '')}</span></span>
              {selected ? <InvoiceStatus status={selected.status} /> : null}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-2xl bg-muted/40 p-4 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">{ui('العميل')}</p><p className="font-semibold">{selected.customerName}</p></div>
                <div><p className="text-xs text-muted-foreground">{ui('الوقت')}</p><p className="nums font-semibold">{formatTime(selected.saleTime, locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">{ui('رقم النظام')}</p><p className="nums font-semibold">{selected.saleNumber}</p></div>
                <div><p className="text-xs text-muted-foreground">{ui('الإجمالي')}</p><p className="nums text-lg font-black text-primary">{toArabicDigits(selected.totalAmount.toFixed(2))} ج.م</p></div>
              </div>
              <div className="space-y-3">
                {(selected.items ?? []).map((item) => {
                  const feedback = itemFeedback[item.id] ?? { rating: 0, comment: '' };
                  return (
                    <div key={item.id} className="grid gap-4 rounded-2xl border p-4 lg:grid-cols-[minmax(0,1fr)_220px_minmax(240px,1fr)]">
                      <div>
                        <p className="font-bold">{item.name}</p>
                        {item.variantName ? <p className="mt-0.5 text-xs font-semibold text-primary">{item.variantName}</p> : null}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <span className="rounded-lg bg-muted p-2">{ui('السعر')} <strong className="nums block text-sm">{toArabicDigits(item.unitPrice.toFixed(2))}</strong></span>
                          <span className="rounded-lg bg-muted p-2">{ui('الكمية')} <strong className="nums block text-sm">{toArabicDigits(item.quantity)}</strong></span>
                          <span className="rounded-lg bg-muted p-2">{ui('الإجمالي')} <strong className="nums block text-sm">{toArabicDigits(item.lineTotal.toFixed(2))}</strong></span>
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">{ui('تقييم الصنف')}</p>
                        <div dir="ltr" className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-label={`${ui('تقييم')} ${value} ${ui('من 5')}`}
                              aria-pressed={feedback.rating === value}
                              disabled={selected.status !== 'completed'}
                              onClick={() => setItemFeedback((current) => ({ ...current, [item.id]: { ...feedback, rating: value } }))}
                              className="rounded p-0.5 transition hover:scale-110 disabled:cursor-not-allowed"
                            >
                              <Star aria-hidden="true" className={`size-7 ${value <= feedback.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25'}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">{ui('ملاحظات الصنف')}</p>
                        <Textarea
                          disabled={selected.status !== 'completed'}
                          value={feedback.comment}
                          onChange={(event) => setItemFeedback((current) => ({ ...current, [item.id]: { ...feedback, comment: event.target.value } }))}
                          className="min-h-20"
                          placeholder={ui('مثال: الطعم ممتاز، التقديم يحتاج تحسين…')}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {selected.receiptComment && (
                <div className="rounded-xl border bg-primary/5 p-3">
                  <p className="mb-1 text-xs font-bold text-primary">{ui('تعليق الإيصال')}</p>
                  <p>{selected.receiptComment}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap">
            {selected?.status === 'completed' && can('gym-sales.sales.drafts:delete') ? (
              <Button variant="destructive" onClick={() => setReversal({ invoice: selected, status: 'cancelled', notes: '' })}>
                <Ban className="size-4" />{ui('إلغاء الفاتورة')}
              </Button>
            ) : null}
            {selected?.status === 'completed' && can('gym-sales.sales.drafts:approve') ? (
              <Button variant="outline" className="border-amber-400 text-amber-700" onClick={() => setReversal({ invoice: selected, status: 'refunded', notes: '' })}>
                <RotateCcw className="size-4" />{ui('استرداد')}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setSelected(null)}>{ui('إغلاق')}</Button>
            {can('gym-sales.sales.drafts:update') ? (
              <Button disabled={selected?.status !== 'completed' || savingFeedback} onClick={() => void saveItemFeedback()}>
                {savingFeedback ? ui('جاري الحفظ…') : ui('حفظ التقييمات المختارة')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reversal != null} onOpenChange={(open) => { if (!open && !reversing) setReversal(null); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{reversal?.status === 'refunded' ? ui('استرداد فاتورة مكتملة') : ui('إلغاء فاتورة مكتملة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {reversal?.status === 'refunded' ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
                  <strong>{ui('المنتجات الجاهزة')}</strong>
                  <p className="mt-1">{ui('مثل المياه والبيبسي: تعود للمخزون لأنها قابلة لإعادة البيع.')}</p>
                </div>
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/20 dark:text-rose-100">
                  <strong>{ui('المنتجات المُحضّرة')}</strong>
                  <p className="mt-1">{ui('مثل اللاتيه والكابتشينو: لا تعود خاماتها للمخزون، وتُسجل تكلفتها هالك تحضير في المخزون والمالية والتقارير.')}</p>
                </div>
                <p className="rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
                  {ui('الاسترداد يعيد المبلغ للعميل بعد تنفيذ الطلب مع الاحتفاظ بسجل الفاتورة والأثر الكامل للمراجعة.')}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                <strong>{ui('إلغاء إداري قبل التحضير أو التسليم')}</strong>
                <p className="mt-1">{ui('يُستخدم لتصحيح طلب لم يُنفذ؛ سيُعكس التحصيل وتعود كل الأصناف والخامات للمخزون وكأن التنفيذ لم يحدث، مع بقاء سجل الإلغاء.')}</p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-semibold">{ui('سبب العملية')} *</label>
              <Textarea
                value={reversal?.notes ?? ''}
                onChange={(event) => setReversal((current) => current ? { ...current, notes: event.target.value } : current)}
                placeholder={ui('مثال: خطأ في الطلب، مرتجع من العميل…')}
                className="min-h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={reversing} onClick={() => setReversal(null)}>{ui('رجوع')}</Button>
            <Button variant="destructive" disabled={reversing || (reversal?.notes.trim().length ?? 0) < 3} onClick={() => void reverseCompletedInvoice()}>
              {reversing ? ui('جاري التنفيذ…') : ui('مراجعة الأثر والمتابعة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}

function InvoiceStatus({ status }: { status: string }) {
  const { ui } = useLocale();
  if (status === 'completed') return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{ui('مكتملة')}</Badge>;
  if (status === 'refunded') return <Badge variant="secondary">{ui('مستردة')}</Badge>;
  if (status === 'cancelled') return <Badge variant="destructive">{ui('ملغاة')}</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{ui('معلقة')}</Badge>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof ReceiptText; label: string; value: string; tone: 'primary' | 'amber' | 'emerald' }) {
  const color = tone === 'amber'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    : tone === 'emerald'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
      : 'bg-primary/10 text-primary';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-xl p-3 ${color}`}><Icon className="size-5" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="nums text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
