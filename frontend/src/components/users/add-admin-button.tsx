import { useId, useRef, useState } from 'react';
import { Loader2, ShieldPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

export function AddAdminButton() {
  const actor = useAuth((state) => state.user);
  return actor?.level === 1 ? <AddAdminDialog key={actor.sub} /> : null;
}

function AddAdminDialog() {
  const { ui, dir } = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'verify' | 'create'>('verify');
  const [currentPassword, setCurrentPassword] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const clear = () => {
    setStep('verify');
    setCurrentPassword('');
    setUsername('');
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
    if (step === 'create' && (username.trim().length < 5 || username.trim().length > 40)) {
      setError(ui('اسم المستخدم يجب أن يكون من ٥ إلى ٤٠ حرف'));
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
        await api.post('/users/system-admin', { currentPassword, username: username.trim(), password });
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
      <Button type="button" variant="secondary" className="min-h-11 bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-foreground/70" onClick={() => changeOpen(true)} permissionAction={null}>
        <ShieldPlus className="size-4" aria-hidden="true" />
        Add Admin
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent dir={dir} className="max-w-md [&>button]:min-h-11 [&>button]:min-w-11" onEscapeKeyDown={(event) => {
          if (inFlight.current) event.preventDefault();
        }} onInteractOutside={(event) => {
          if (inFlight.current) event.preventDefault();
        }}>
          <DialogHeader>
            <DialogTitle>{ui('إضافة أدمن')}</DialogTitle>
            <DialogDescription className="text-foreground/80">
              {step === 'verify'
                ? ui('اكتب كلمة مرور حسابك عشان تقدر تضيف أدمن جديد.')
                : ui('اكتب اسم المستخدم وكلمة المرور للأدمن الجديد. الحساب مستقل ومش محتاج ملف موظف.')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-5" aria-busy={busy}>
            <fieldset disabled={busy} className="space-y-4">
              {step === 'verify' ? (
                <div className="space-y-2">
                  <Label htmlFor={id + '-current'}>{ui('كلمة مرور حسابك')}</Label>
                  <Input id={id + '-current'} type="password" autoComplete="current-password" autoFocus
                    className="min-h-11 border-foreground/50 text-base focus-visible:border-foreground focus-visible:ring-foreground/70 dark:border-foreground/50 dark:focus-visible:border-foreground dark:focus-visible:ring-foreground/70" required maxLength={256} value={currentPassword}
                    aria-invalid={!!error} aria-describedby={error ? id + '-error' : undefined}
                    onChange={(event) => { setCurrentPassword(event.target.value); setError(''); }} />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor={id + '-username'}>{ui('اسم المستخدم الجديد')}</Label>
                    <Input id={id + '-username'} autoComplete="off" autoCapitalize="none" spellCheck={false}
                      dir="ltr" autoFocus className="min-h-11 border-foreground/50 text-base focus-visible:border-foreground focus-visible:ring-foreground/70 dark:border-foreground/50 dark:focus-visible:border-foreground dark:focus-visible:ring-foreground/70" required minLength={5} maxLength={40}
                      value={username} aria-describedby={id + '-username-hint'}
                      onChange={(event) => { setUsername(event.target.value); setError(''); }} />
                    <p id={id + '-username-hint'} className="text-sm text-foreground/75">{ui('من ٥ إلى ٤٠ حرف، ويكون غير مستخدم قبل كده.')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={id + '-password'}>{ui('كلمة مرور الأدمن الجديد')}</Label>
                    <Input id={id + '-password'} type="password" autoComplete="new-password"
                      className="min-h-11 border-foreground/50 text-base focus-visible:border-foreground focus-visible:ring-foreground/70 dark:border-foreground/50 dark:focus-visible:border-foreground dark:focus-visible:ring-foreground/70" required minLength={5} maxLength={72} value={password}
                      aria-describedby={id + '-password-hint'}
                      onChange={(event) => { setPassword(event.target.value); setError(''); }} />
                    <p id={id + '-password-hint'} className="text-sm text-foreground/75">{ui('٥ أحرف على الأقل.')}</p>
                  </div>
                </>
              )}
            </fieldset>
            {error && <p id={id + '-error'} role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => changeOpen(false)} permissionAction={null}>{ui('إلغاء')}</Button>
              <Button type="submit" variant="secondary" className="min-h-11 bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-foreground/70" disabled={busy} permissionAction={null}>
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

