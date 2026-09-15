import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/store/theme';

export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="top-center"
      dir="rtl"
      toastOptions={{
        classNames: {
          toast: 'font-sans rounded-xl border border-border bg-popover text-popover-foreground shadow-lg',
        },
      }}
    />
  );
}
