import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

type LocationType = 'country' | 'city' | 'region';

interface LocationNode {
  id: number;
  name: string | null;
  type: LocationType | null;
  parentId: number | null;
  children: LocationNode[];
}

const TYPE_LABELS: Record<LocationType, string> = {
  country: uiStatic('الدولة'),
  city: uiStatic('المدينة'),
  region: uiStatic('المنطقة'),
};

interface DialogState {
  type: LocationType;
  parentId: number | null;
  /** present when editing an existing node */
  id: number | null;
  name: string;
}

export function LocationsPage() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['locations', 'tree'],
    queryFn: async () => {
      const { data: tree } = await api.get<LocationNode[]>('/locations/tree');
      return tree;
    },
  });

  const countries = useMemo(() => data ?? [], [data]);

  const [countryId, setCountryId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.id === countryId) ?? null,
    [countries, countryId],
  );
  const cities = selectedCountry?.children ?? [];

  const selectedCity = useMemo(
    () => cities.find((c) => c.id === cityId) ?? null,
    [cities, cityId],
  );
  const regions = selectedCity?.children ?? [];

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(
    () => [
      { title: ui('الدول'), value: toArabicDigits(countries.length), icon: <MapPin className="size-5" /> },
    ],
    [countries],
  );

  const openAdd = (type: LocationType, parentId: number | null) =>
    setDialog({ type, parentId, id: null, name: '' });

  const openEdit = (node: LocationNode) =>
    setDialog({
      type: node.type ?? 'country',
      parentId: node.parentId,
      id: node.id,
      name: node.name ?? '',
    });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['locations'] });

  const save = async () => {
    if (!dialog) return;
    if (!dialog.name.trim()) {
      toast.error(ui('الاسم مطلوب'));
      return;
    }
    setSaving(true);
    try {
      if (dialog.id) {
        await api.patch(`/locations/${dialog.id}`, { name: dialog.name.trim() });
      } else {
        await api.post('/locations', {
          name: dialog.name.trim(),
          type: dialog.type,
          parentId: dialog.parentId ?? undefined,
        });
      }
      toast.success(ui('تم الحفظ'));
      setDialog(null);
      await refetch();
      void refresh();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (node: LocationNode) => {
    const ok = await confirm({
      title: `${ui('حذف')} ${TYPE_LABELS[node.type ?? 'country']}`,
      description: `${ui('هل تريد حذف «')}${node.name ?? ''}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/locations/${node.id}`);
      toast.success(ui('تم الحذف'));
      // clear selection if the removed node was selected.
      if (node.type === 'country' && node.id === countryId) {
        setCountryId(null);
        setCityId(null);
      }
      if (node.type === 'city' && node.id === cityId) setCityId(null);
      await refetch();
      void refresh();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const selectCountry = (id: number) => {
    setCountryId(id);
    setCityId(null);
  };

  return (
    <>
      <ListPageShell
        title={ui('المواقع (دول/مدن/مناطق)')}
        description={ui('دليل هرمي: الدولة ثم المدينة ثم المنطقة')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
      >
        {isError ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-destructive">
              {ui('تعذّر تحميل المواقع.')}
              <Button variant="outline" size="sm" className="me-3" onClick={() => void refetch()}>
                {ui('إعادة المحاولة')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <LocationColumn
              title={ui('الدول')}
              type="country"
              nodes={countries}
              loading={isLoading}
              selectedId={countryId}
              onSelect={selectCountry}
              onAdd={() => openAdd('country', null)}
              onEdit={openEdit}
              onDelete={remove}
              emptyText={ui('لا توجد دول بعد')}
            />
            <LocationColumn
              title={ui('المدن')}
              type="city"
              nodes={cities}
              loading={false}
              selectedId={cityId}
              onSelect={setCityId}
              onAdd={selectedCountry ? () => openAdd('city', selectedCountry.id) : undefined}
              onEdit={openEdit}
              onDelete={remove}
              placeholder={ui('اختر دولة لعرض مدنها')}
              hasParent={!!selectedCountry}
              emptyText={ui('لا توجد مدن لهذه الدولة')}
            />
            <LocationColumn
              title={ui('المناطق')}
              type="region"
              nodes={regions}
              loading={false}
              selectedId={null}
              onAdd={selectedCity ? () => openAdd('region', selectedCity.id) : undefined}
              onEdit={openEdit}
              onDelete={remove}
              placeholder={ui('اختر مدينة لعرض مناطقها')}
              hasParent={!!selectedCity}
              emptyText={ui('لا توجد مناطق لهذه المدينة')}
            />
          </div>
        )}
      </ListPageShell>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {dialog?.id ? `${ui('تعديل')} ${TYPE_LABELS[dialog.type]}` : `${ui('إضافة')} ${dialog ? TYPE_LABELS[dialog.type] : ''}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="location-name">{ui('الاسم')}</Label>
              <Input
                id="location-name"
                className="mt-1.5"
                value={dialog?.name ?? ''}
                onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface LocationColumnProps {
  title: string;
  type: LocationType;
  nodes: LocationNode[];
  loading: boolean;
  selectedId: number | null;
  onSelect?: (id: number) => void;
  onAdd?: () => void;
  onEdit: (node: LocationNode) => void;
  onDelete: (node: LocationNode) => void;
  placeholder?: string;
  hasParent?: boolean;
  emptyText: string;
}

function LocationColumn({ title,
  nodes,
  loading,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  placeholder,
  hasParent = true,
  emptyText,
}: LocationColumnProps) {
  const { ui } = useLocale();
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {onAdd && (
          <Button variant="brand" size="sm" onClick={onAdd}>
            <Plus className="size-4" /> {ui('إضافة')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{ui('جارٍ التحميل…')}</p>
        ) : !hasParent ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{placeholder}</p>
        ) : nodes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          nodes.map((node) => (
            <div
              key={node.id}
              className={cn(
                'group flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                onSelect && 'cursor-pointer hover:bg-accent',
                selectedId === node.id && 'border-primary bg-accent',
              )}
              onClick={onSelect ? () => onSelect(node.id) : undefined}
            >
              <span className="flex items-center gap-1.5 truncate">
                {onSelect && <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{node.name ?? '—'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={ui('تعديل')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(node);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={ui('حذف')}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDelete(node);
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
