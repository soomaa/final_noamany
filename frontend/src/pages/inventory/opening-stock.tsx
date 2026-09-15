import { InventoryPageShell } from './inventory-shell';
import { OpeningStockTab } from './opening-stock-tab';
import { useLocale } from '@/store/locale';

export function InventoryOpeningStockPage() {
  const { ui } = useLocale();
  return (
    <InventoryPageShell title={ui('بضاعة أول المدة')} description={ui('تسجيل الأرصدة الافتتاحية للمستودعات')}>
      <OpeningStockTab />
    </InventoryPageShell>
  );
}
