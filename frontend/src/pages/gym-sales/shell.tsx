import type { ReactNode } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { useLocale } from '@/store/locale';

export function GymSalesPageShell({
  section,
  title,
  description,
  children,
  actions,
  notImplemented,
}: {
  section: 'procurement' | 'sales';
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
  notImplemented?: boolean;
}) {
  const { ui } = useLocale();
  const eyebrow =
    section === 'procurement'
      ? ui('ادارة الكافيه والمخازن · إدارة المشتريات')
      : ui('ادارة الكافيه والمخازن · إدارة البيع');

  return (
    <div className="space-y-6">
      <PageHeader title={ui(title)} description={description ? ui(description) : undefined} eyebrow={eyebrow} actions={actions} />
      {notImplemented ? (
        <NotImplementedState title={ui(`${title} — الوحدة قيد الترحيل`)} />
      ) : (
        children
      )}
    </div>
  );
}
