import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiError } from '@/lib/api';
import { clubEventsApi } from '@/lib/api/club-events';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const KINDS = [
  { value: 'competition', label: uiStatic('مسابقة') },
  { value: 'challenge', label: uiStatic('تحدي') },
  { value: 'workshop', label: uiStatic('ورشة عمل') },
  { value: 'bootcamp', label: uiStatic('معسكر تدريبي') },
  { value: 'seminar', label: uiStatic('ندوة') },
  { value: 'open_day', label: uiStatic('يوم مفتوح') },
  { value: 'community', label: uiStatic('مجتمعي') },
  { value: 'kids_activity', label: uiStatic('نشاط أطفال') },
  { value: 'campaign', label: uiStatic('حملة') },
];

interface Category {
  id: number;
  nameAr: string;
  nameEn: string | null;
  kind: string;
  color: string | null;
  requiresApproval: boolean;
  isActive: boolean;
}

function GeneralSettingsForm() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['club-event-settings'],
    queryFn: () => clubEventsApi.getEventSettings(),
  });

  const [refundWindowDays, setRefundWindowDays] = useState('');
  const [waitlistHoldHours, setWaitlistHoldHours] = useState('');
  const [approvalBudgetThreshold, setApprovalBudgetThreshold] = useState('');
  const [reminderHoursBefore, setReminderHoursBefore] = useState('');

  useEffect(() => {
    if (!data) return;
    setRefundWindowDays(String(data.refundWindowDays ?? ''));
    setWaitlistHoldHours(String(data.waitlistHoldHours ?? ''));
    setApprovalBudgetThreshold(data.approvalBudgetThreshold != null ? String(data.approvalBudgetThreshold) : '');
    setReminderHoursBefore(String(data.reminderHoursBefore ?? ''));
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      clubEventsApi.updateEventSettings({
        refundWindowDays: refundWindowDays !== '' ? Number(refundWindowDays) : undefined,
        waitlistHoldHours: waitlistHoldHours !== '' ? Number(waitlistHoldHours) : undefined,
        approvalBudgetThreshold: approvalBudgetThreshold !== '' ? Number(approvalBudgetThreshold) : undefined,
        reminderHoursBefore: reminderHoursBefore !== '' ? Number(reminderHoursBefore) : undefined,
      }),
    onSuccess: () => {
      toast.success(ui('تم حفظ الإعدادات بنجاح'));
      void qc.invalidateQueries({ queryKey: ['club-event-settings'] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">{ui('جاري التحميل...')}</div>;
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{ui('مدة نافذة الاسترداد (أيام)')}</Label>
          <Input type="number" min={0} value={refundWindowDays} onChange={e => setRefundWindowDays(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{ui('مدة حجز قائمة الانتظار (ساعات)')}</Label>
          <Input type="number" min={0} value={waitlistHoldHours} onChange={e => setWaitlistHoldHours(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{ui('حد الموافقة على الميزانية')}</Label>
          <Input type="number" min={0} value={approvalBudgetThreshold} onChange={e => setApprovalBudgetThreshold(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{ui('التذكير قبل الفعالية (ساعات)')}</Label>
          <Input type="number" min={0} value={reminderHoursBefore} onChange={e => setReminderHoursBefore(e.target.value)} />
        </div>
      </div>
      <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? ui('جاري الحفظ...') : ui('حفظ التغييرات')}
      </Button>
    </div>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category: Category | null;
}) {
  const { ui, dir } = useLocale();
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [kind, setKind] = useState('workshop');
  const [color, setColor] = useState('#3b82f6');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (category) {
      setNameAr(category.nameAr);
      setNameEn(category.nameEn ?? '');
      setKind(category.kind);
      setColor(category.color ?? '#3b82f6');
      setRequiresApproval(category.requiresApproval);
      setIsActive(category.isActive);
    } else {
      setNameAr('');
      setNameEn('');
      setKind('workshop');
      setColor('#3b82f6');
      setRequiresApproval(false);
      setIsActive(true);
    }
  }, [category, open]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = { nameAr, nameEn: nameEn || undefined, kind, color, requiresApproval, isActive };
      return category ? clubEventsApi.updateCategory(category.id, body) : clubEventsApi.createCategory(body);
    },
    onSuccess: () => {
      toast.success(ui('تم الحفظ بنجاح'));
      void qc.invalidateQueries({ queryKey: ['club-event-categories'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiError(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" aria-describedby={undefined} dir={dir}>
        <DialogHeader><DialogTitle>{category ? ui('تعديل تصنيف') : ui('تصنيف جديد')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{ui('الاسم بالعربية *')}</Label>
              <Input value={nameAr} onChange={e => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{ui('الاسم بالإنجليزية')}</Label>
              <Input value={nameEn} onChange={e => setNameEn(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{ui('النوع *')}</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{ui('اللون')}</Label>
              <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 p-1" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={requiresApproval} onCheckedChange={v => setRequiresApproval(v === true)} />
            {ui('يتطلب اعتماد قبل النشر')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={v => setIsActive(v === true)} />
            {ui('نشط')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ui('إلغاء')}</Button>
          <Button disabled={!nameAr.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? ui('جاري الحفظ...') : ui('حفظ')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoriesTable() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['club-event-categories'],
    queryFn: () => clubEventsApi.listCategories(),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clubEventsApi.deleteCategory(id),
    onSuccess: () => {
      toast.success(ui('تم الحذف بنجاح'));
      void qc.invalidateQueries({ queryKey: ['club-event-categories'] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const categories: Category[] = Array.isArray(data) ? data : (data?.data ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{ui('تصنيفات الفعاليات')}</h3>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 ms-1" /> {ui('تصنيف جديد')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4">{ui('جاري التحميل...')}</div>
      ) : categories.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">{ui('لا توجد تصنيفات بعد')}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الاسم')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('النوع')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('اللون')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('يتطلب اعتماد')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('نشط')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الإجراءات')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.map(cat => (
                <tr key={cat.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{cat.nameAr}{cat.nameEn ? ` (${cat.nameEn})` : ''}</td>
                  <td className="px-4 py-3 text-muted-foreground">{KINDS.find(k => k.value === cat.kind)?.label ?? cat.kind}</td>
                  <td className="px-4 py-3">
                    {cat.color && <span className="inline-block h-4 w-4 rounded-full border" style={{ backgroundColor: cat.color }} />}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{cat.requiresApproval ? ui('نعم') : ui('لا')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{cat.isActive ? ui('نعم') : ui('لا')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(cat); setDialogOpen(true); }}>{ui('تعديل')}</Button>
                      <button
                        onClick={() => deleteMutation.mutate(cat.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} category={editing} />
    </div>
  );
}

export function EventSettingsPage() {
  const { ui, dir } = useLocale();
  const [tab, setTab] = useState<'general' | 'categories'>('general');

  return (
    <div className="p-6 space-y-4" dir={dir}>
      <PageHeader title={ui('إعدادات الفعاليات')} />

      <div className="flex gap-2 border-b">
        {([
          { key: 'general', label: ui('عام') },
          { key: 'categories', label: ui('التصنيفات') },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'px-4 py-2 text-sm border-b-2 transition-colors ' +
              (tab === t.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' ? <GeneralSettingsForm /> : <CategoriesTable />}
    </div>
  );
}
