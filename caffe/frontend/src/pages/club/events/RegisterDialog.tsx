import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, User, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, apiError } from '@/lib/api';
import { clubEventsApi } from '@/lib/api/club-events';
import { useLocale } from '@/store/locale';
import type { ClubMemberListItem } from '@/types/club';

interface EventTier {
  id: number;
  name: string;
  audience: string;
  price: number;
  earlyBirdPrice: number | null;
  earlyBirdUntil: string | null;
}

interface EventDetail {
  id: number;
  title: string;
  allowGuests: boolean;
  requiresGuardianConsent: boolean;
  tiers?: EventTier[];
}

interface RegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventDetail;
}

export function RegisterDialog({ open, onOpenChange, event }: RegisterDialogProps) {
  const { ui, dir } = useLocale();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'member' | 'guest'>('member');

  // Member lookup
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [memberResults, setMemberResults] = useState<ClubMemberListItem[]>([]);

  // Guest fields
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // Tier
  const [tierId, setTierId] = useState('');

  // Guardian block
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('');
  const [consentSigned, setConsentSigned] = useState(false);

  const tiers = event.tiers ?? [];

  const searchMembers = async () => {
    const q = memberSearch.trim();
    if (!q) return;
    setSearching(true);
    try {
      const { data } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
        params: { search: q, pageSize: 10 },
      });
      setMemberResults(data.data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSearching(false);
    }
  };

  const registerMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        eventId: event.id,
        tierId: tierId ? Number(tierId) : undefined,
        registrantType: mode,
      };
      if (mode === 'member') {
        body.memberId = selectedMember?.id;
      } else {
        body.guestName = guestName;
        body.guestPhone = guestPhone || undefined;
        body.guestEmail = guestEmail || undefined;
      }
      if (event.requiresGuardianConsent) {
        body.guardianName = guardianName || undefined;
        body.guardianPhone = guardianPhone || undefined;
        body.guardianRelation = guardianRelation || undefined;
        body.consentSigned = consentSigned;
      }
      return clubEventsApi.createRegistration(body);
    },
    onSuccess: () => {
      toast.success(ui('تم تسجيل المشارك بنجاح'));
      void qc.invalidateQueries({ queryKey: ['club-event-registrations', event.id] });
      void qc.invalidateQueries({ queryKey: ['club-event', event.id] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const reset = () => {
    setMemberSearch('');
    setSelectedMember(null);
    setMemberResults([]);
    setGuestName('');
    setGuestPhone('');
    setGuestEmail('');
    setTierId('');
    setGuardianName('');
    setGuardianPhone('');
    setGuardianRelation('');
    setConsentSigned(false);
  };

  const canSubmit =
    (mode === 'member' ? !!selectedMember : !!guestName.trim()) &&
    (!event.requiresGuardianConsent || consentSigned);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined} dir={dir}>
        <DialogHeader>
          <DialogTitle>{ui('تسجيل مشارك')} — {event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button type="button" variant={mode === 'member' ? 'default' : 'outline'} size="sm" onClick={() => setMode('member')} className="flex-1">
              <User className="h-4 w-4 ms-1" /> {ui('عضو')}
            </Button>
            {event.allowGuests && (
              <Button type="button" variant={mode === 'guest' ? 'default' : 'outline'} size="sm" onClick={() => setMode('guest')} className="flex-1">
                <UserPlus className="h-4 w-4 ms-1" /> {ui('ضيف')}
              </Button>
            )}
          </div>

          {mode === 'member' ? (
            <div className="space-y-2">
              <Label>{ui('بحث عن عضو (الاسم / الكود / الهاتف)')}</Label>
              <div className="flex gap-2">
                <Input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchMembers()}
                  placeholder={ui('ابحث...')}
                />
                <Button type="button" variant="outline" onClick={searchMembers} disabled={searching}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {memberResults.length > 0 && (
                <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                  {memberResults.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setSelectedMember(m); setMemberResults([]); setMemberSearch(m.name); }}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
                    >
                      <span>{m.name}</span>
                      <span className="text-xs text-muted-foreground">{m.memberCode}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedMember && (
                <div className="rounded-md bg-muted/50 p-3 text-sm flex items-center justify-between">
                  <span>{selectedMember.name} — {selectedMember.memberCode}</span>
                  <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setSelectedMember(null)}>
                    {ui('إزالة')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{ui('اسم الضيف *')}</Label>
                <Input value={guestName} onChange={e => setGuestName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{ui('الهاتف')}</Label>
                  <Input value={guestPhone} onChange={e => setGuestPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{ui('البريد الإلكتروني')}</Label>
                  <Input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {tiers.length > 0 && (
            <div className="space-y-1.5">
              <Label>{ui('فئة التذكرة')}</Label>
              <Select value={tierId} onValueChange={setTierId}>
                <SelectTrigger><SelectValue placeholder={ui('اختر الفئة')} /></SelectTrigger>
                <SelectContent>
                  {tiers.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} — {t.price} {ui('ج.م')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {event.requiresGuardianConsent && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="text-sm font-medium">{ui('بيانات ولي الأمر (مطلوب)')}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{ui('اسم ولي الأمر')}</Label>
                  <Input value={guardianName} onChange={e => setGuardianName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{ui('هاتف ولي الأمر')}</Label>
                  <Input value={guardianPhone} onChange={e => setGuardianPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{ui('صلة القرابة')}</Label>
                <Input value={guardianRelation} onChange={e => setGuardianRelation(e.target.value)} placeholder={ui('أب / أم / وصي')} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={consentSigned} onChange={e => setConsentSigned(e.target.checked)} />
                {ui('تم توقيع إقرار الموافقة')}
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ui('إلغاء')}</Button>
          <Button disabled={!canSubmit || registerMutation.isPending} onClick={() => registerMutation.mutate()}>
            {registerMutation.isPending ? ui('جاري التسجيل...') : ui('تسجيل')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
