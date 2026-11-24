import { useId, useRef, useState } from 'react';
import { Loader2, ShieldPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { isSystemAdminUser } from '@/lib/user-scope';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

/** «Add Admin» on حسابات النظام (from MetaFit): only an admin sees it. */
export function AddAdminButton() {
  const actor = useAuth((state) => state.user);
  return isSystemAdminUser(actor) ? <AddAdminDialog key={actor?.sub} /> : null;
}

function AddAdminDialog() {
  const { ui, dir } = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'verify' | 'create'>('verify');
  const [currentPassword, setCurrentPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullname, setFullname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const clear = () => {
    setStep('verify');
    setCurrentPassword('');
    setUsername('');
    setFullname('');
    setPassword('');
    setError('');
  };

  const changeOpen = (next: boolean) => {
    if (inFlight.current) return;
    clear();
    setOpen(next);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (step === 'create' && (username.trim().length < 3 || username.trim().length > 40)) {
      setError(ui('اسم المستخدم يجب أن يكون من ٣ إلى ٤٠ حرفًا'));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (step === 'verify') {
        await api.post('/users/system-admin/verify', { currentPassword });
        setStep('create');
      } else {
        await api.post('/users/system-admin', {
          currentPassword,
          username: username.trim(),
          fullname: fullname.trim() || undefined,
          password,
        });
        clear();
        setOpen(false);
        toast.success(ui('تم إنشاء حساب الأدمن'));
        void queryClient.invalidateQueries({ queryKey: ['users'] });
      }
    } catch (cause) {
      const message = apiError(cause);
      setError(ui(message));
      if (step === 'verify' || message.includes('كلمة مرور حسابك')) {
        setCurrentPassword('');
        setStep('verify');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" className="bg-foreground text-background hover:bg-foreground/90" onClick={() => changeOpen(true)}>
        <ShieldPlus className="size-4" aria-hidden="true" />
        Add Admin
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          dir={dir}
          className="max-w-md"
          onEscapeKeyDown={(event) => { if (inFlight.current) event.preventDefault(); }}
          onInteractOutside={(event) => { if (inFlight.current) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{ui('إضافة أدمن')}</DialogTitle>
            <DialogDescription>
              {step === 'verify'
                ? ui('اكتب كلمة مرور حسابك عشان تقدر تضيف أدمن جديد.')
                : ui('اكتب اسم المستخدم والاسم وكلمة المرور للأدمن الجديد. الحساب مستقل ومش محتاج ملف موظف.')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-5" aria-busy={busy}>
            <fieldset disabled={busy} className="space-y-4">
              {step === 'verify' ? (
                <div className="space-y-2">
                  <Label htmlFor={id + '-current'}>{ui('كلمة مرور حسابك')}</Label>
                  <Input id={id + '-current'} type="password" autoComplete="current-password" autoFocus required maxLength={256}
                    value={currentPassword} aria-invalid={!!error}
                    onChange={(event) => { setCurrentPassword(event.target.value); setError(''); }} />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor={id + '-username'}>{ui('اسم المستخدم الجديد')}</Label>
                    <Input id={id + '-username'} autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" autoFocus
                      required minLength={3} maxLength={40} value={username}
                      onChange={(event) => { setUsername(event.target.value); setError(''); }} />
                    <p className="text-xs text-muted-foreground">{ui('من ٣ إلى ٤٠ حرفًا، وألا يكون مستخدمًا من قبل.')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={id + '-fullname'}>{ui('الاسم')}</Label>
                    <Input id={id + '-fullname'} maxLength={100} value={fullname} placeholder={ui('لو سبته فاضي هيتكتب اسم المستخدم')}
                      onChange={(event) => { setFullname(event.target.value); setError(''); }} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={id + '-password'}>{ui('كلمة مرور الأدمن الجديد')}</Label>
                    <Input id={id + '-password'} type="password" autoComplete="new-password" required minLength={5} maxLength={72}
                      value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} />
                    <p className="text-xs text-muted-foreground">{ui('٥ أحرف على الأقل.')}</p>
                  </div>
                </>
              )}
            </fieldset>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => changeOpen(false)}>{ui('إلغاء')}</Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {busy ? ui('جارٍ التنفيذ…') : step === 'verify' ? ui('تأكيد والمتابعة') : ui('إنشاء الأدمن')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
