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
import { LocaleProvider, useLocale } from '@/store/locale';
import { ThemeProvider } from '@/store/theme';
import '@/styles/index.css';
import { installOne80AuditLabels } from '@/adapters/one80/audit-label-registry';
import { installOne80LocaleDictionaries } from '@/adapters/one80/locale-dictionaries';
import { installOne80AuthenticatedRoutes } from '@/adapters/one80/authenticated-routes';
import { installOne80Brand } from '@/adapters/one80/brand';
import { installOne80ReportShortcuts } from '@/adapters/one80/report-shortcuts';

installOne80AuditLabels();
installOne80LocaleDictionaries();
installOne80AuthenticatedRoutes();
installOne80Brand();
installOne80ReportShortcuts();

function DirectionShell({ children }: { children: React.ReactNode }) {
  const { dir } = useLocale();
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}

async function bootstrap() {
  const { App } = await import('@/App');
  const rootElement = document.getElementById('root') as (HTMLElement & { __hrRoot?: Root }) | null;
  if (!rootElement) throw new Error('Root element was not found');
  const root = rootElement.__hrRoot ?? createRoot(rootElement);
  rootElement.__hrRoot = root;

  root.render(
    <StrictMode>
      <LocaleProvider>
        <ThemeProvider>
          <DirectionShell>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter>
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

void bootstrap();
