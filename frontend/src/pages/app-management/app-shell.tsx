import type { ReactNode } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useLocale } from '@/store/locale';

export function AppManagementShell({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { ui } = useLocale();
  return (
    <div className="space-y-6">
      <PageHeader
        title={ui(title)}
        description={description ? ui(description) : undefined}
        eyebrow={ui('إدارة التطبيق')}
        actions={actions}
      />
      {children}
    </div>
  );
}

export async function uploadAppImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { api } = await import('@/lib/api');
  const { data } = await api.post<{ url: string; path: string }>('/uploads/app', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.path;
}
