import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';
import { SimpleCrudTab, indexColumn } from './simple-crud-tab';

interface WarehouseRow {
  id: number;
  warehouseCode: string;
  nameAr: string;
  branchId: number;
  status: string;
}

interface StorageRow {
  id: number;
  name: string;
  email: string;
  branchId: number;
}

export function WarehousesTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery({ filters: { sub: 'warehouses' } });
  const sub = params.filters.sub ?? 'warehouses';
  const { data: branches } = useBranches();

  const warehouseColumns = useMemo<ColumnDef<WarehouseRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<WarehouseRow>,
      { accessorKey: 'warehouseCode', header: ui('الكود') },
      { accessorKey: 'nameAr', header: ui('الاسم') },
      {
        accessorKey: 'branchId',
        header: ui('الفرع'),
        cell: ({ getValue }) => branches?.find((b) => b.id === getValue())?.name ?? '—',
      },
    ],
    [branches, ui, params.page, params.pageSize],
  );

  const storageColumns = useMemo<ColumnDef<StorageRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<StorageRow>,
      { accessorKey: 'name', header: ui('الاسم') },
      { accessorKey: 'email', header: ui('البريد') },
    ],
    [ui, params.page, params.pageSize],
  );

  return (
    <div className="space-y-4">
      <Tabs value={sub} onValueChange={(v) => setParams({ filters: { sub: v }, page: 1 })}>
        <TabsList>
          <TabsTrigger value="warehouses">{ui('المستودعات')}</TabsTrigger>
          <TabsTrigger value="storages">{ui('المخازن الفرعية')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {sub === 'warehouses' ? (
        <SimpleCrudTab<WarehouseRow>
          resource="warehouses"
          title={ui('المستودعات')}
          emptyForm={{ warehouseCode: '', nameAr: '', nameEn: '', branchId: String(branches?.[0]?.id ?? '') }}
          fields={[
            { key: 'warehouseCode', label: ui('كود المستودع'), required: true },
            { key: 'nameAr', label: ui('الاسم (عربي)'), required: true },
            { key: 'nameEn', label: ui('الاسم (إنجليزي)') },
            { key: 'branchId', label: ui('معرّف الفرع'), required: true, type: 'number' },
          ]}
          columns={warehouseColumns}
          mapRowToForm={(r) => ({
            warehouseCode: r.warehouseCode,
            nameAr: r.nameAr,
            nameEn: '',
            branchId: String(r.branchId),
          })}
          mapFormToPayload={(f) => ({
            warehouseCode: f.warehouseCode,
            nameAr: f.nameAr,
            nameEn: f.nameEn || f.nameAr,
            branchId: Number(f.branchId),
          })}
        />
      ) : (
        <SimpleCrudTab<StorageRow>
          resource="storages"
          title={ui('المخازن الفرعية')}
          emptyForm={{ name: '', email: '', branchId: String(branches?.[0]?.id ?? '') }}
          fields={[
            { key: 'name', label: ui('الاسم'), required: true },
            { key: 'email', label: ui('البريد'), required: true },
            { key: 'branchId', label: ui('معرّف الفرع'), required: true, type: 'number' },
          ]}
          columns={storageColumns}
          mapRowToForm={(r) => ({ name: r.name, email: r.email, branchId: String(r.branchId) })}
          mapFormToPayload={(f) => ({
            name: f.name,
            email: f.email,
            branchId: Number(f.branchId),
          })}
        />
      )}
    </div>
  );
}
