import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import { DirectionProvider } from '@radix-ui/react-direction';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { queryClient } from '@/lib/query';
import { LocaleProvider, useLocale } from '@/store/locale';
import { ThemeProvider } from '@/store/theme';
import '@/styles/index.css';
import { PortableApp } from './app';

const root = document.getElementById('root');
if (!root) throw new Error('Root element was not found');

function PortableDirection({ children }: { children: ReactNode }) {
  const { dir } = useLocale();
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}

createRoot(root).render(<StrictMode><LocaleProvider><ThemeProvider><PortableDirection><QueryClientProvider client={queryClient}><BrowserRouter><PortableApp /><Toaster /></BrowserRouter></QueryClientProvider></PortableDirection></ThemeProvider></LocaleProvider></StrictMode>);
