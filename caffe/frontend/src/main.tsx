import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import { DirectionProvider } from '@radix-ui/react-direction';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App';
import { Toaster } from '@/components/ui/sonner';
import { queryClient } from '@/lib/query';
import { LocaleProvider, useLocale } from '@/store/locale';
import { ThemeProvider } from '@/store/theme';
import '@/styles/index.css';

function DirectionShell({ children }: { children: React.ReactNode }) {
  const { dir } = useLocale();
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}

const rootElement = document.getElementById('root') as (HTMLElement & { __one80Root?: Root }) | null;
if (!rootElement) throw new Error('Root element was not found');
const root = rootElement.__one80Root ?? createRoot(rootElement);
rootElement.__one80Root = root;

root.render(
  <StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <DirectionShell>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <App />
              <Toaster />
            </BrowserRouter>
          </QueryClientProvider>
        </DirectionShell>
      </ThemeProvider>
    </LocaleProvider>
  </StrictMode>,
);
