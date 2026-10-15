import type { ReactNode } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useLocale } from '@/store/locale';

export function FinancePageShell({
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
        eyebrow={ui('التقارير المالية')}
        actions={actions}
      />
      {children}
    </div>
  );
}
