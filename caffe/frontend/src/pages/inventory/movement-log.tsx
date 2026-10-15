import { InventoryPageShell } from './inventory-shell';
import { MovementsTab } from './movements-tab';
import { useLocale } from '@/store/locale';

export function InventoryMovementLogPage() {
  const { ui } = useLocale();
  return (
    <InventoryPageShell title={ui('سجل الحركات')} description={ui('سجل تدقيقي لكل تغيّر في أرصدة المخزون')}>
      <MovementsTab />
    </InventoryPageShell>
  );
}
