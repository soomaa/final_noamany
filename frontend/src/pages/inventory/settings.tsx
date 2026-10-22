import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import { SimpleCrudTab } from './simple-crud-tab';
import { useLocale } from '@/store/locale';

export function InventorySettingsPage() {
  const { ui } = useLocale();
  const user = useAuth((s) => s.user);
  const { data: branches = [] } = useBranches();
  // Branch-bound users can only create warehouses in their own branch.
  const ownBranch = user?.branch ? String(user.branch) : '';
  return (
    <SimpleCrudTab<{id: number; nameAr: string; address: string | null; branchId: number}>
      resource="warehouses"
      title={ui('إعدادات المخازن')}
      emptyForm={{ nameAr: '', address: '', branchId: ownBranch }}
      fields={[
        { key: 'nameAr', label: ui('اسم المخزن'), required: true },
        { key: 'address', label: ui('المكان / العنوان'), required: true },
        {
          key: 'branchId',
          label: ui('الفرع'),
          type: 'select',
          required: true,
          disabled: !!ownBranch,
          options: branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` })),
        },
      ]}
      columns={[
        { accessorKey: 'nameAr', header: ui('اسم المخزن') },
        { accessorKey: 'address', header: ui('المكان / العنوان') },
        { accessorKey: 'branchId', header: ui('الفرع'), cell: ({ getValue }) => branches.find((b) => b.id === getValue())?.name ?? '—' },
      ]}
      mapRowToForm={(r) => ({ nameAr: r.nameAr, address: r.address ?? '', branchId: String(r.branchId) })}
      mapFormToPayload={(f) => ({ nameAr: f.nameAr.trim(), address: f.address.trim(), branchId: Number(f.branchId || ownBranch) })}
    />
  );
}
