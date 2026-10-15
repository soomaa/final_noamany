import { useEffect, useMemo, useState } from 'react';
import { Archive, Edit2, GripVertical, ListOrdered, PackageCheck, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';
import { useListQuery } from '@/lib/use-list-query';
import { usePaginatedList, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { toast } from 'sonner';
import type { CafeCategory } from '@/types/cafe';
import { usePermission } from '@/hooks/use-permission';
import { FoodEmojiPicker } from '@/components/cafe/food-emoji-picker';
import { CafeCategoryIcon } from '@/components/cafe/cafe-category-icon';

interface CategoryFormState {
  nameAr: string;
  nameEn: string;
  emoji: string;
  description: string;
  isActive: boolean;
}

const emptyForm: CategoryFormState = {
  nameAr: '',
  nameEn: '',
  emoji: 'icon:utensils',
  description: '',
  isActive: true,
};

function SortableCategory({ category, index, disabled }: { category: CafeCategory; index: number; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-w-0 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-start shadow-sm transition ${
        isDragging ? 'z-10 border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing'}`}
      {...attributes}
      {...listeners}
      aria-label={`${category.nameAr} — ${index + 1}`}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {index + 1}
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-700" aria-hidden="true">
        <CafeCategoryIcon value={category.emoji} className="size-4.5" />
      </span>
      <span className="truncate text-sm font-medium">{category.nameAr}</span>
    </button>
  );
}

export function CafeCategoriesPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const { params, setParams } = useListQuery({
    pageSize: 25,
    filters: { status: 'active' },
  });
  const [categoriesTab, setCategoriesTab] = useState<'active' | 'archived' | 'order'>(
    params.filters.status === 'inactive' ? 'archived' : 'active',
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderedCategories, setOrderedCategories] = useState<CafeCategory[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data, isLoading, isError, error, refetch } = usePaginatedList<CafeCategory>('categories', params);
  const { data: activeCategoriesData, isLoading: isOrderLoading } = usePaginatedList<CafeCategory>('categories', {
    page: 1,
    pageSize: 500,
    search: '',
    filters: { status: 'active' },
  });

  useEffect(() => {
    setOrderedCategories(activeCategoriesData?.data ?? []);
  }, [activeCategoriesData?.data]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setEmojiPickerOpen(false);
    setDialogOpen(true);
  };

  const openEdit = (row: CafeCategory) => {
    setEditingId(row.id);
    setForm({
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      emoji: row.emoji || 'icon:utensils',
      description: row.description ?? '',
      isActive: row.isActive,
    });
    setEmojiPickerOpen(false);
    setDialogOpen(true);
  };

  const saveMutation = useMutationWithToast(
    async (vars: { id?: number; body: CategoryFormState }) => {
      const payload = {
        nameAr: vars.body.nameAr.trim(),
        nameEn: vars.body.nameEn.trim() || vars.body.nameAr.trim(),
        emoji: vars.body.emoji || 'icon:utensils',
        description: vars.body.description.trim() || undefined,
        parentCategoryId: null,
        isActive: vars.body.isActive,
      };
      if (vars.id) {
        await api.put(`/categories/${vars.id}`, payload);
      } else {
        await api.post('/categories', payload);
      }
    },
    {
      success: editingId ? ui('تم تحديث الفئة') : ui('تم إضافة الفئة'),
      invalidate: ['categories'],
      onSuccess: () => {
        setDialogOpen(false);
        setForm(emptyForm);
        setEditingId(null);
        setEmojiPickerOpen(false);
      },
    },
  );

  const deleteMutation = useMutationWithToast(
    async (id: number) => {
      await api.delete(`/categories/${id}`);
    },
    { success: ui('تم حذف الفئة نهائيًا'), invalidate: ['categories', 'cafe-products'] },
  );

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const { data: updated } = await api.patch<CafeCategory>(`/categories/${id}/status`, { isActive });
      return updated;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? ui('تم تنشيط الفئة') : ui('تم نقل الفئة إلى الأرشيف'));
      qc.setQueryData<PaginatedResponse<CafeCategory>>(['categories', params], (current) => {
        if (!current?.data.some((category) => category.id === variables.id)) return current;
        return {
          ...current,
          data: current.data.filter((category) => category.id !== variables.id),
          total: Math.max(0, current.total - 1),
        };
      });
      void qc.invalidateQueries({ queryKey: ['categories'] });
      void qc.invalidateQueries({ queryKey: ['cafe-products'] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const orderMutation = useMutation({
    mutationFn: async (categories: CafeCategory[]) => {
      await api.patch('/categories/order', { categoryIds: categories.map((category) => category.id) });
    },
    onSuccess: () => {
      toast.success(ui('تم حفظ ترتيب الفئات في نقطة البيع'));
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedCategories.findIndex((category) => category.id === active.id);
    const to = orderedCategories.findIndex((category) => category.id === over.id);
    if (from < 0 || to < 0) return;

    const reordered = arrayMove(orderedCategories, from, to);
    const previous = orderedCategories;
    setOrderedCategories(reordered);
    orderMutation.mutate(reordered, { onError: () => setOrderedCategories(previous) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr.trim()) {
      toast.error(ui('اسم الفئة العربي مطلوب'));
      return;
    }
    setIsSubmitting(true);
    try {
      await saveMutation.mutateAsync({ id: editingId ?? undefined, body: form });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (row: CafeCategory) => {
    const ok = await confirm({
      title: ui('حذف الفئة نهائيًا'),
      description: `${ui('سيتم حذف')} "${row.nameAr}" ${ui('نهائيًا. لن يُسمح بالحذف إذا كانت الفئة مستخدمة في منتجات أو فئات أخرى.')}`,
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns = useMemo(
    () => [
      {
        header: ui('شكل الفئة'),
        accessorKey: 'emoji',
        cell: ({ row }: { row: { original: CafeCategory } }) => (
          <span className="flex size-10 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" aria-hidden="true">
            <CafeCategoryIcon value={row.original.emoji} className="size-5" />
          </span>
        ),
      },
      { header: ui('الاسم العربي'), accessorKey: 'nameAr' },
      { header: ui('الاسم الإنجليزي'), accessorKey: 'nameEn' },
      { header: ui('الاستخدام'), accessorKey: 'description' },
      {
        header: ui('الحالة'),
        accessorKey: 'isActive',
        cell: ({ row }: { row: { original: CafeCategory } }) => {
          const category = row.original;
          const isChanging = statusMutation.isPending && statusMutation.variables?.id === category.id;
          return can('club.cafe.categories:update') ? (
            <div className="flex min-w-24 items-center gap-2">
              <Switch
                checked={category.isActive}
                disabled={isChanging}
                onCheckedChange={(isActive) => statusMutation.mutate({ id: category.id, isActive })}
                aria-label={category.isActive ? ui('تعطيل الفئة') : ui('تنشيط الفئة')}
              />
              <span className={category.isActive ? 'text-xs font-semibold text-success' : 'text-xs text-muted-foreground'}>
                {category.isActive ? ui('نشط') : ui('معطل')}
              </span>
            </div>
          ) : (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                category.isActive ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground'
              }`}
            >
              {category.isActive ? ui('نشط') : ui('معطل')}
            </span>
          );
        },
      },
      {
        header: ui('إجراءات'),
        id: 'actions',
        cell: ({ row }: { row: { original: CafeCategory } }) => (
          <div className="flex items-center gap-1">
            {can('club.cafe.categories:update') ? <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
              <Edit2 className="size-4" />
            </Button> : null}
            {!row.original.isActive && can('club.cafe.categories:delete') ? <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              title={ui('حذف نهائي')}
              disabled={deleteMutation.isPending}
              onClick={() => handleDelete(row.original)}
            >
              <Trash2 className="size-4" />
            </Button> : null}
          </div>
        ),
      },
    ],
    [can, deleteMutation.isPending, statusMutation.isPending, statusMutation.variables, ui],
  );

  const categoriesTable = (
    <DataTable
      columns={columns}
      data={data?.data ?? []}
      total={data?.total ?? 0}
      page={params.page}
      pageSize={params.pageSize}
      onPageChange={(page) => setParams({ page })}
      onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
      isLoading={isLoading}
      isError={isError}
      errorMessage={apiError(error)}
      onRetry={refetch}
      search={params.search}
      onSearchChange={(search) => setParams({ search, page: 1 })}
      searchPlaceholder={ui('بحث بالاسم…')}
    />
  );

  return (
    <ListPageShell
      title={ui('فئات الكافيه')}
      description={ui('تصنيفات منتجات الكافيه المشتركة مع المخزون')}
      actions={
        can('club.cafe.categories:create') ? <Button onClick={openCreate}>
          <Plus className="me-2 size-4" />
          {ui('فئة جديدة')}
        </Button> : null
      }
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={refetch}
    >
      <div className="mb-4 rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        {ui('فئات الكافيه تنظّم منتجات البيع في تبويبات نقطة البيع والتقارير، مثل مشروبات ساخنة وباردة ومأكولات وحلويات. الخامات لا تُصنّف هنا.')}
      </div>
      <Tabs
        value={categoriesTab}
        onValueChange={(value) => {
          const nextTab = value as 'active' | 'archived' | 'order';
          setCategoriesTab(nextTab);
          if (nextTab !== 'order') {
            setParams({
              page: 1,
              filters: { status: nextTab === 'archived' ? 'inactive' : 'active' },
            });
          }
        }}
        dir="rtl"
        className="space-y-4"
      >
        <TabsList className={`grid h-auto w-full gap-2 rounded-2xl bg-muted/60 p-2 ${
          can('club.cafe.categories:update') ? 'max-w-3xl grid-cols-3' : 'max-w-xl grid-cols-2'
        }`}>
          <TabsTrigger value="active" className="gap-2 rounded-xl py-2.5">
            <PackageCheck className="size-4" />
            {ui('الفئات النشطة')}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2 rounded-xl py-2.5">
            <Archive className="size-4" />
            {ui('الفئات المعطلة / الأرشيف')}
          </TabsTrigger>
          {can('club.cafe.categories:update') ? (
            <TabsTrigger value="order" className="gap-2 rounded-xl py-2.5">
              <ListOrdered className="size-4" />
              {ui('ترتيب الفئات في نقطة البيع')}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="active" className="mt-0">
          {categoriesTab === 'active' ? categoriesTable : null}
        </TabsContent>
        <TabsContent value="archived" className="mt-0">
          {categoriesTab === 'archived' ? categoriesTable : null}
        </TabsContent>
        <TabsContent value="order" className="mt-0">
          {categoriesTab === 'order' && can('club.cafe.categories:update') ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3">
                <h2 className="font-semibold">{ui('ترتيب الفئات في نقطة البيع')}</h2>
                <p className="text-sm text-muted-foreground">{ui('اسحب الفئات وأفلتها بالترتيب الذي تريد ظهوره في تبويبات نقطة البيع.')}</p>
              </div>
              {isOrderLoading ? (
                <p className="text-sm text-muted-foreground">{ui('جاري تحميل الفئات…')}</p>
              ) : orderedCategories.length ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
                  <SortableContext items={orderedCategories.map((category) => category.id)} strategy={rectSortingStrategy}>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {orderedCategories.map((category, index) => (
                        <SortableCategory
                          key={category.id}
                          category={category}
                          index={index}
                          disabled={orderMutation.isPending}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <p className="text-sm text-muted-foreground">{ui('لا توجد فئات نشطة لترتيبها.')}</p>
              )}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEmojiPickerOpen(false);
        }}
      >
        <DialogContent size="md" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? ui('تعديل الفئة') : ui('فئة جديدة')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{ui('شكل الفئة')}</Label>
              <button
                type="button"
                onClick={() => setEmojiPickerOpen((open) => !open)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-muted/20 p-3 text-start transition hover:border-primary/60 hover:bg-primary/5"
                aria-expanded={emojiPickerOpen}
              >
                <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 shadow-sm dark:bg-sky-950 dark:text-sky-300">
                  <CafeCategoryIcon value={form.emoji} className="size-8" />
                </span>
                <span>
                  <span className="block font-semibold">{ui('اختيار شكل الفئة')}</span>
                  <span className="block text-sm text-muted-foreground">
                    {ui('اختاري من مكتبة أيقونات المطعم والكافيه')}
                  </span>
                </span>
              </button>
              {emojiPickerOpen ? (
                <FoodEmojiPicker
                  value={form.emoji}
                  onChange={(emoji) => {
                    setForm((current) => ({ ...current, emoji }));
                    setEmojiPickerOpen(false);
                  }}
                  onClose={() => setEmojiPickerOpen(false)}
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>{ui('الاسم العربي')}</Label>
              <Input
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{ui('الاسم الإنجليزي')}</Label>
              <Input
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{ui('وصف الاستخدام')}</Label>
              <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={ui('مثال: تظهر كمجموعة مشروبات ساخنة في نقطة البيع')} />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="catActive"
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
              <Label htmlFor="catActive">{ui('الفئة نشطة')}</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {ui('إلغاء')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? ui('جاري الحفظ…') : editingId ? ui('حفظ') : ui('إضافة')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
