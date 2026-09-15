import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';
import type { NamedEntity } from '@/types/inventory';
import { SimpleCrudTab, indexColumn } from './simple-crud-tab';

export function SettingsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery({ filters: { setting: 'categories' } });
  const setting = params.filters.setting ?? 'categories';

  const nameColumns = useMemo(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<NamedEntity>,
      {
        accessorKey: 'nameAr',
        header: ui('الاسم (عربي)'),
        cell: ({ row }: { row: { original: NamedEntity } }) => row.original.nameAr ?? row.original.name ?? '—',
      },
      {
        accessorKey: 'nameEn',
        header: ui('الاسم (إنجليزي)'),
        cell: ({ row }: { row: { original: NamedEntity } }) => row.original.nameEn ?? '—',
      },
    ],
    [ui, params.page, params.pageSize],
  );

  const mainCatColumns = useMemo(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<NamedEntity>,
      { accessorKey: 'name', header: ui('الاسم') },
    ],
    [ui, params.page, params.pageSize],
  );

  const resources: Record<
    string,
    {
      resource: string;
      title: string;
      fields: { key: string; label: string; required?: boolean }[];
      columns: ColumnDef<NamedEntity>[];
      mapRow: (r: NamedEntity) => Record<string, string>;
      mapPayload: (f: Record<string, string>) => Record<string, unknown>;
      empty: Record<string, string>;
    }
  > = {
    categories: {
      resource: 'categories',
      title: ui('التصنيفات'),
      fields: [
        { key: 'nameAr', label: ui('الاسم (عربي)'), required: true },
        { key: 'nameEn', label: ui('الاسم (إنجليزي)'), required: true },
      ],
      columns: nameColumns,
      empty: { nameAr: '', nameEn: '' },
      mapRow: (r) => ({ nameAr: r.nameAr ?? '', nameEn: r.nameEn ?? '' }),
      mapPayload: (f) => ({ nameAr: f.nameAr, nameEn: f.nameEn || f.nameAr }),
    },
    brands: {
      resource: 'brands',
      title: ui('العلامات التجارية'),
      fields: [
        { key: 'nameAr', label: ui('الاسم (عربي)'), required: true },
        { key: 'nameEn', label: ui('الاسم (إنجليزي)'), required: true },
      ],
      columns: nameColumns,
      empty: { nameAr: '', nameEn: '' },
      mapRow: (r) => ({ nameAr: r.nameAr ?? '', nameEn: r.nameEn ?? '' }),
      mapPayload: (f) => ({ nameAr: f.nameAr, nameEn: f.nameEn || f.nameAr }),
    },
    manufacturers: {
      resource: 'manufacturers',
      title: ui('الشركات المصنعة'),
      fields: [
        { key: 'nameAr', label: ui('الاسم (عربي)'), required: true },
        { key: 'nameEn', label: ui('الاسم (إنجليزي)'), required: true },
      ],
      columns: nameColumns,
      empty: { nameAr: '', nameEn: '' },
      mapRow: (r) => ({ nameAr: r.nameAr ?? '', nameEn: r.nameEn ?? '' }),
      mapPayload: (f) => ({ nameAr: f.nameAr, nameEn: f.nameEn || f.nameAr }),
    },
    'main-categories': {
      resource: 'main-categories',
      title: ui('التصنيفات الرئيسية'),
      fields: [{ key: 'name', label: ui('الاسم'), required: true }],
      columns: mainCatColumns,
      empty: { name: '' },
      mapRow: (r) => ({ name: r.name ?? r.nameAr ?? '' }),
      mapPayload: (f) => ({ name: f.name }),
    },
    suppliers: {
      resource: 'suppliers',
      title: ui('الموردون'),
      fields: [
        { key: 'nameAr', label: ui('الاسم (عربي)'), required: true },
        { key: 'nameEn', label: ui('الاسم (إنجليزي)'), required: true },
      ],
      columns: nameColumns,
      empty: { nameAr: '', nameEn: '' },
      mapRow: (r) => ({ nameAr: r.nameAr ?? '', nameEn: r.nameEn ?? '' }),
      mapPayload: (f) => ({ nameAr: f.nameAr, nameEn: f.nameEn || f.nameAr }),
    },
    'unit-templates': {
      resource: 'unit-templates',
      title: ui('قوالب الوحدات'),
      fields: [
        { key: 'nameAr', label: ui('الاسم (عربي)'), required: true },
        { key: 'nameEn', label: ui('الاسم (إنجليزي)'), required: true },
        { key: 'code', label: ui('الكود'), required: true },
      ],
      columns: nameColumns,
      empty: { nameAr: '', nameEn: '', code: '' },
      mapRow: (r) => ({ nameAr: r.nameAr ?? '', nameEn: r.nameEn ?? '', code: '' }),
      mapPayload: (f) => ({ nameAr: f.nameAr, nameEn: f.nameEn || f.nameAr, code: f.code }),
    },
  };

  const cfg = resources[setting] ?? resources.categories;

  return (
    <div className="space-y-4">
      <Tabs value={setting} onValueChange={(v) => setParams({ filters: { setting: v }, page: 1 })}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="categories">{ui('التصنيفات')}</TabsTrigger>
          <TabsTrigger value="main-categories">{ui('رئيسية')}</TabsTrigger>
          <TabsTrigger value="brands">{ui('العلامات')}</TabsTrigger>
          <TabsTrigger value="manufacturers">{ui('المصنعون')}</TabsTrigger>
          <TabsTrigger value="suppliers">{ui('الموردون')}</TabsTrigger>
          <TabsTrigger value="unit-templates">{ui('الوحدات')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <SimpleCrudTab<NamedEntity>
        key={cfg.resource}
        resource={cfg.resource}
        title={cfg.title}
        fields={cfg.fields}
        columns={cfg.columns}
        emptyForm={cfg.empty}
        mapRowToForm={cfg.mapRow}
        mapFormToPayload={cfg.mapPayload}
      />
    </div>
  );
}
