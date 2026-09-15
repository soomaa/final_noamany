import { InventoryPageShell } from './inventory-shell';
import { TransactionsTab } from './transactions-tab';
import { useLocale } from '@/store/locale';

export function InventoryTransactionsPage() {
  const { ui } = useLocale();
  return (
    <InventoryPageShell title={ui('الحركات المخزنية')} description={ui('إنشاء واعتماد حركات الاستلام والصرف والتحويل')}>
      <TransactionsTab />
    </InventoryPageShell>
  );
}
