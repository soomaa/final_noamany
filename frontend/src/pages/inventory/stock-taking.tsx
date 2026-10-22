import { InventoryPageShell } from './inventory-shell';
import { StockTakingSheet } from './stock-taking-sheet';
import { useLocale } from '@/store/locale';

export function InventoryStockTakingPage() {
  const { ui } = useLocale();
  return (
    <InventoryPageShell title={ui('الجرد')} description={ui('محاضر جرد المخازن واعتماد فروقات الكميات')}>
      <StockTakingSheet />
    </InventoryPageShell>
  );
}
