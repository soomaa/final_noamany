import { useState } from 'react';
import { Plus } from 'lucide-react';
import { InventoryPageShell } from './inventory-shell';
import { StockTakingTab } from './opening-stock-tab';
import { useLocale } from '@/store/locale';
import { DailyStockOverview } from '@/components/inventory/daily-stock-overview';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';

export function InventoryStockTakingPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = can('gym-sales.inventory.stock_taking:create');
  return (
    <InventoryPageShell
      title={ui('الجرد والتسويات')}
      description={ui('جلسات الجرد واعتماد فروقات الكميات')}
      actions={canCreate ? (
        <Button permissionAction="create" className="h-11 px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {ui('إنشاء جلسة جرد')}
        </Button>
      ) : undefined}
    >
      <div className="space-y-6">
        <DailyStockOverview />
        <StockTakingTab createOpen={createOpen} onCreateOpenChange={setCreateOpen} />
      </div>
    </InventoryPageShell>
  );
}
