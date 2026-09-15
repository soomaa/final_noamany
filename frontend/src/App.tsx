import { useEffect } from 'react';
import { AppRouter } from '@/app/router';
import { LOGO_SRC } from '@/components/brand/logo';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

export function App() {
  const { bootstrap, status } = useAuth();
  const { ui } = useLocale();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-white via-[#FFF5F5] to-brand-100 p-5 shadow-[0_16px_48px_-12px_rgba(237,28,36,0.5)]">
            <img
              src={LOGO_SRC}
              alt=""
              className="login-logo-float h-32 w-auto max-w-[26rem] object-contain"
            />
          </div>
          <p className="text-sm text-white/50">{ui('جاري التحميل…')}</p>
        </div>
      </div>
    );
  }

  return <AppRouter />;
}
