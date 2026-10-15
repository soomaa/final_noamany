import { InventoryPageShell } from './inventory-shell';
import { DashboardTab } from './dashboard-tab';
import { useLocale } from '@/store/locale';

export function InventoryDashboardPage() {
  const { ui } = useLocale();
  return (
    <InventoryPageShell title={ui('لوحة تحكم المخزون')} description={ui('مراقبة المخزون وتحليل البيانات')}>
      <DashboardTab />
    </InventoryPageShell>
  );
}
