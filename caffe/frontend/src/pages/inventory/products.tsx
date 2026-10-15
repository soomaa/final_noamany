import { InventoryPageShell } from './inventory-shell';
import { ProductsTab } from './products-tab';
import { useLocale } from '@/store/locale';

export function InventoryProductsPage() {
  const { ui } = useLocale();
  return (
    <InventoryPageShell title={ui('المنتجات والخدمات')} description={ui('إدارة كتالوج الأصناف القابلة للبيع والاستهلاك')}>
      <ProductsTab />
    </InventoryPageShell>
  );
}
