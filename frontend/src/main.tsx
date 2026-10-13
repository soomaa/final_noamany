import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import { DirectionProvider } from '@radix-ui/react-direction';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { queryClient } from '@/lib/query';
import { setUiStaticMap } from '@/lib/ui-static';
import { LocaleProvider, useLocale } from '@/store/locale';
import { ThemeProvider } from '@/store/theme';
import '@/styles/index.css';

function DirectionShell({ children }: { children: React.ReactNode }) {
  const { dir } = useLocale();
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}

async function bootstrap() {
  // Arabic is the default and does not need the large inline-copy translation map.
  // English users load it before the first render so module-level option labels remain correct.
  if (localStorage.getItem('one80_locale') === 'en') {
    const module = await import('@/locales/ui-map.json');
    setUiStaticMap(module.default as Record<string, string>);
  }

  const rootElement = document.getElementById('root') as (HTMLElement & { __one80Root?: Root }) | null;
  if (!rootElement) throw new Error('Root element was not found');
  const root = rootElement.__one80Root ?? createRoot(rootElement);
  rootElement.__one80Root = root;
  // Keep the application graph dynamic so a module-load error is displayed rather
  // than leaving a silent blank screen during startup.
  const { App } = await import('@/App');

  root.render(
    <StrictMode>
      <LocaleProvider>
        <ThemeProvider>
          <DirectionShell>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter future={{ v7_relativeSplatPath: true }}>
                <App />
                <Toaster />
              </BrowserRouter>
            </QueryClientProvider>
          </DirectionShell>
        </ThemeProvider>
      </LocaleProvider>
    </StrictMode>,
  );
}

function renderStartupError(error: unknown) {
  const root = document.getElementById('root');
  if (!root) return;
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#111;color:#fff;font-family:Tajawal,sans-serif;text-align:center"><section><h1 style="font-size:20px">تعذّر تشغيل النظام</h1><p style="color:#fca5a5;max-width:680px;white-space:pre-wrap">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p><p style="color:#a3a3a3;font-size:14px">حدّث الصفحة بعد إصلاح الخطأ.</p></section></main>`;
}

void bootstrap().catch(renderStartupError);
