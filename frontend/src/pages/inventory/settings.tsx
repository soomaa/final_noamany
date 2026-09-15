import { InventoryPageShell } from './inventory-shell';
import { SettingsTab } from './settings-tab';
import { useLocale } from '@/store/locale';

export function InventorySettingsPage() {
  const { ui } = useLocale();
  return (
    <InventoryPageShell title={ui('الأعدادات')} description={ui('التصنيفات، العلامات، الموردون، وقوالب الوحدات')}>
      <SettingsTab />
    </InventoryPageShell>
  );
}
