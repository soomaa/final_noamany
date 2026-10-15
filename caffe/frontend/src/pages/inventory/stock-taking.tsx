import { InventoryPageShell } from './inventory-shell';
import { StockTakingTab } from './opening-stock-tab';
import { useLocale } from '@/store/locale';
import { DailyStockOverview } from '@/components/inventory/daily-stock-overview';

export function InventoryStockTakingPage() {
  const { ui } = useLocale();
  return (
    <InventoryPageShell title={ui('الجرد والتسويات')} description={ui('جلسات الجرد واعتماد فروقات الكميات')}>
      <div className="space-y-6">
        <DailyStockOverview />
        <StockTakingTab />
      </div>
    </InventoryPageShell>
  );
}
