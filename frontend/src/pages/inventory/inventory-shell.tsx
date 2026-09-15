import type { ReactNode } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useLocale } from '@/store/locale';

export function InventoryPageShell({
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
        eyebrow={ui('إدارة الكافيه والمخزون')}
        actions={actions}
      />
      {children}
    </div>
  );
}
