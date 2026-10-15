import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranches } from '@/hooks/use-branches';
import { apiError } from '@/lib/api';
import { clubEventsApi } from '@/lib/api/club-events';
import { uiStatic } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';

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

const VISIBILITIES = [
  { value: 'members', label: uiStatic('الأعضاء فقط') },
  { value: 'public', label: uiStatic('عام') },
  { value: 'internal', label: uiStatic('داخلي') },
];

const AUDIENCES = [
  { value: 'member', label: uiStatic('عضو') },
  { value: 'guest', label: uiStatic('ضيف') },
  { value: 'both', label: uiStatic('الكل') },
];

interface TierRow {
  key: string;
  name: string;
  audience: string;
  price: string;
  earlyBirdPrice: string;
  earlyBirdUntil: string;
  capacity: string;
}

function newTier(): TierRow {
  return {
    key: crypto.randomUUID(),
    name: '',
    audience: 'both',
    price: '0',
    earlyBirdPrice: '',
    earlyBirdUntil: '',
    capacity: '',
  };
}

const STEPS = [uiStatic('البيانات الأساسية'), uiStatic('السعة والتسجيل'), uiStatic('فئات التذاكر'), uiStatic('المراجعة')] as const;

export function EventCreateWizard() {
  const { ui, dir } = useLocale();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const { data: categories } = useQuery({
    queryKey: ['club-event-categories', 'active'],
    queryFn: () => clubEventsApi.listCategories(true),
  });

  const [step, setStep] = useState(0);

  // Step 1: basics
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [kind, setKind] = useState('');
  const [branchId, setBranchId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venueName, setVenueName] = useState('');

  // Step 2: capacity & registration window
  const [maxCapacity, setMaxCapacity] = useState('0');
  const [waitlistCapacity, setWaitlistCapacity] = useState('0');
  const [registrationOpens, setRegistrationOpens] = useState('');
  const [registrationCloses, setRegistrationCloses] = useState('');
  const [visibility, setVisibility] = useState('members');
  const [isFree, setIsFree] = useState(false);
  const [allowGuests, setAllowGuests] = useState(false);
  const [requiresActiveSubscription, setRequiresActiveSubscription] = useState(true);
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [requiresGuardianConsent, setRequiresGuardianConsent] = useState(false);

  // Step 3: ticket tiers
  const [tiers, setTiers] = useState<TierRow[]>([newTier()]);

  const categoryOptions = useMemo(
    () => (Array.isArray(categories) ? categories : (categories?.data ?? [])),
    [categories],
  );

  const addTier = () => setTiers(prev => [...prev, newTier()]);
  const removeTier = (key: string) => setTiers(prev => prev.filter(t => t.key !== key));
  const updateTier = (key: string, patch: Partial<TierRow>) =>
    setTiers(prev => prev.map(t => (t.key === key ? { ...t, ...patch } : t)));

  const createMutation = useMutation({
    mutationFn: async () => {
      const event = await clubEventsApi.createEvent({
        title,
        description: description || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        kind,
        branchId: branchId ? Number(branchId) : undefined,
        venueName: venueName || undefined,
        startDate,
        endDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        registrationOpens: registrationOpens ? registrationOpens.slice(0, 10) : undefined,
        registrationCloses: registrationCloses ? registrationCloses.slice(0, 10) : undefined,
        maxCapacity: Number(maxCapacity) || 0,
        waitlistCapacity: Number(waitlistCapacity) || 0,
        visibility,
        isFree,
        allowGuests,
        requiresActiveSubscription,
        minAge: minAge ? Number(minAge) : undefined,
        maxAge: maxAge ? Number(maxAge) : undefined,
        requiresGuardianConsent,
      });

      // Ticket tiers are created via a dedicated bulk field if backend supports it; otherwise
      // this wizard only submits the event itself — tier rows are informational until the
      // sessions/tiers sub-resource endpoints are wired. We still surface validation here so the
      // organizer isn't surprised when tiers must be added on the event detail page.
      return event;
    },
    onSuccess: (event) => {
      toast.success(ui('تم إنشاء الفعالية كمسودة بنجاح'));
      void qc.invalidateQueries({ queryKey: ['club-events'] });
      navigate(`/club/events/${event.id}`);
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const canNext = () => {
    if (step === 0) return !!title && !!categoryId && !!kind && !!branchId && !!startDate && !!endDate;
    if (step === 1) return true;
    if (step === 2) return tiers.every(t => t.name.trim() || tiers.length === 1);
    return true;
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto" dir={dir}>
      <PageHeader title={ui('إنشاء فعالية جديدة')} description={ui('أنشئ فعالية جديدة كمسودة ثم أكمل باقي الخطوات لاحقاً')} />

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ' +
                (i === step
                  ? 'bg-primary text-primary-foreground'
                  : i < step
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground')
              }
            >
              {i + 1}
            </div>
            <span className={'text-xs ' + (i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-6 space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{ui('عنوان الفعالية *')}</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={ui('اسم الفعالية')} />
            </div>
            <div className="space-y-1.5">
              <Label>{ui('الوصف')}</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ui('التصنيف *')}</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder={ui('اختر التصنيف')} /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((c: { id: number; nameAr: string }) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{ui('النوع *')}</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger><SelectValue placeholder={ui('اختر النوع')} /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ui('الفرع *')}</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder={ui('اختر الفرع')} /></SelectTrigger>
                  <SelectContent>
                    {(branches ?? []).map((b: { id: number; name: string | null }) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name ?? '—'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{ui('القاعة / المكان')}</Label>
                <Input value={venueName} onChange={e => setVenueName(e.target.value)} placeholder={ui('اسم القاعة أو المكان')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ui('تاريخ البداية *')}</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ui('تاريخ النهاية *')}</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ui('وقت البداية')}</Label>
                <Time12Input value={startTime} onValueChange={setStartTime} />
              </div>
              <div className="space-y-1.5">
                <Label>{ui('وقت النهاية')}</Label>
                <Time12Input value={endTime} onValueChange={setEndTime} />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ui('الحد الأقصى للمشاركين')}</Label>
                <Input type="number" min={0} value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ui('سعة قائمة الانتظار')}</Label>
                <Input type="number" min={0} value={waitlistCapacity} onChange={e => setWaitlistCapacity(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ui('فتح التسجيل')}</Label>
                <Input type="date" value={registrationOpens} onChange={e => setRegistrationOpens(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ui('إغلاق التسجيل')}</Label>
                <Input type="date" value={registrationCloses} onChange={e => setRegistrationCloses(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{ui('الظهور')}</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISIBILITIES.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ui('الحد الأدنى للعمر')}</Label>
                <Input type="number" min={0} value={minAge} onChange={e => setMinAge(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ui('الحد الأقصى للعمر')}</Label>
                <Input type="number" min={0} value={maxAge} onChange={e => setMaxAge(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isFree} onCheckedChange={v => setIsFree(v === true)} />
                {ui('فعالية مجانية')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={allowGuests} onCheckedChange={v => setAllowGuests(v === true)} />
                {ui('السماح بتسجيل الضيوف (غير الأعضاء)')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={requiresActiveSubscription}
                  onCheckedChange={v => setRequiresActiveSubscription(v === true)}
                />
                {ui('يتطلب اشتراك نشط')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={requiresGuardianConsent}
                  onCheckedChange={v => setRequiresGuardianConsent(v === true)}
                />
                {ui('يتطلب موافقة ولي الأمر')}
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{ui('فئات التذاكر')}</h3>
              <Button type="button" variant="outline" size="sm" onClick={addTier}>
                <Plus className="h-4 w-4 ms-1" /> {ui('إضافة فئة')}
              </Button>
            </div>
            <div className="space-y-3">
              {tiers.map((tier, i) => (
                <div key={tier.key} className="rounded-md border p-4 space-y-3 relative">
                  {tiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTier(tier.key)}
                      className="absolute top-3 left-3 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <div className="text-xs font-medium text-muted-foreground">{ui('فئة')} {i + 1}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{ui('اسم الفئة')}</Label>
                      <Input value={tier.name} onChange={e => updateTier(tier.key, { name: e.target.value })} placeholder={ui('مثال: عادي')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{ui('الفئة المستهدفة')}</Label>
                      <Select value={tier.audience} onValueChange={v => updateTier(tier.key, { audience: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AUDIENCES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>{ui('السعر')}</Label>
                      <Input type="number" min={0} value={tier.price} onChange={e => updateTier(tier.key, { price: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{ui('سعر الحجز المبكر')}</Label>
                      <Input type="number" min={0} value={tier.earlyBirdPrice} onChange={e => updateTier(tier.key, { earlyBirdPrice: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{ui('حتى تاريخ')}</Label>
                      <Input type="date" value={tier.earlyBirdUntil} onChange={e => updateTier(tier.key, { earlyBirdUntil: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{ui('السعة (اختياري)')}</Label>
                    <Input type="number" min={0} value={tier.capacity} onChange={e => updateTier(tier.key, { capacity: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {ui('يمكن إضافة/تعديل فئات التذاكر أيضاً من صفحة تفاصيل الفعالية بعد الإنشاء.')}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <h3 className="font-medium">{ui('مراجعة البيانات')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground">{ui('العنوان:')} </span>{title || '—'}</div>
              <div><span className="text-muted-foreground">{ui('النوع:')} </span>{KINDS.find(k => k.value === kind)?.label ?? '—'}</div>
              <div><span className="text-muted-foreground">{ui('تاريخ البداية:')} </span>{startDate || '—'}</div>
              <div><span className="text-muted-foreground">{ui('تاريخ النهاية:')} </span>{endDate || '—'}</div>
              <div><span className="text-muted-foreground">{ui('الحد الأقصى:')} </span>{maxCapacity}</div>
              <div><span className="text-muted-foreground">{ui('مجانية:')} </span>{isFree ? ui('نعم') : ui('لا')}</div>
              <div><span className="text-muted-foreground">{ui('السماح بالضيوف:')} </span>{allowGuests ? ui('نعم') : ui('لا')}</div>
              <div><span className="text-muted-foreground">{ui('عدد فئات التذاكر:')} </span>{tiers.length}</div>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              {ui('سيتم إنشاء الفعالية بحالة "مسودة" — يمكنك تعديلها وتقديمها للاعتماد لاحقاً.')}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(s => Math.max(0, s - 1))}
        >
          {ui('السابق')}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" disabled={!canNext()} onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>
            {ui('التالي')}
          </Button>
        ) : (
          <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? ui('جاري الحفظ...') : ui('حفظ كمسودة')}
          </Button>
        )}
      </div>
    </div>
  );
}
