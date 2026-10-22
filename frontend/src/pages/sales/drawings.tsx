import { TransactionsTab } from '@/pages/inventory/transactions-tab';
import { InventoryPageShell } from '@/pages/inventory/inventory-shell';
export function SalesDrawingsPage() {
  return <InventoryPageShell title="مسحوبات الإدارة" description="مستندات المسحوبات والمستفيدون دون إيراد أو مديونية شخصية"><TransactionsTab drawingsOnly /></InventoryPageShell>;
}
