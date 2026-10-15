import { useEffect } from 'react';
import { AppRouter } from '@/app/router';
import { BrandLogo } from '@/components/brand/logo';
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
          <BrandLogo size="lg" className="login-logo-float" />
          <p className="text-sm text-white/50">{ui('جاري التحميل…')}</p>
        </div>
      </div>
    );
  }

  return <AppRouter />;
}
