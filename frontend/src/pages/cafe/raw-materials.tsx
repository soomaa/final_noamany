import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Boxes, ChevronDown, Coffee, CupSoda, Dumbbell, PackageCheck, type LucideIcon } from 'lucide-react';
import { InventoryPageShell } from '@/pages/inventory/inventory-shell';
import { ProductsTab } from '@/pages/inventory/products-tab';
import { IngredientSwapWorkspace } from '@/components/cafe/ingredient-swap-workspace';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { InventorySection } from '@/types/inventory';

interface MaterialSection {
  id: InventorySection;
  title: string;
  description: string;
  inventoryKind: 'raw_material' | 'ready_product';
  createLabel: string;
  icon: LucideIcon;
  tone: string;
}

export function CafeRawMaterialsPage() {
  const { ui } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'swap' ? 'swap' : 'materials';
  const initialSourceId = searchParams.get('sourceIngredientId') ?? undefined;
  const [openSection, setOpenSection] = useState<InventorySection>('preparation_ingredients');
  const sections: MaterialSection[] = [
    {
      id: 'preparation_ingredients',
      title: ui('خامات التحضير'),
      description: ui('البن والحليب والسكر والصوصات المصنّعة وكل مكون يدخل فعليًا في وصفة منتج.'),
      inventoryKind: 'raw_material',
      createLabel: ui('إضافة خامة / مصنعة'),
      icon: Coffee,
      tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    },
    {
      id: 'ready_products',
      title: ui('المنتجات الجاهزة'),
      description: ui('منتجات تُباع كما هي بدون وصفة، مثل المياه والمشروبات المعبأة والسناكس.'),
      inventoryKind: 'ready_product',
      createLabel: ui('إضافة منتج جاهز'),
      icon: PackageCheck,
      tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    {
      id: 'serving_packaging',
      title: ui('مستلزمات التقديم والتغليف'),
      description: ui('الأكواب الورقية والأغطية والشاليموه والملاعق والأكياس ومواد التغليف.'),
      inventoryKind: 'raw_material',
      createLabel: ui('إضافة مستلزم تقديم'),
      icon: CupSoda,
      tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    },
    {
      id: 'gym_operations',
      title: ui('مستلزمات تشغيل الجيم'),
      description: ui('المناديل ومواد النظافة والاستهلاكات اليومية الخاصة بتشغيل صالة الجيم.'),
      inventoryKind: 'raw_material',
      createLabel: ui('إضافة مستلزم تشغيل'),
      icon: Dumbbell,
      tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    },
  ];

  return (
    <InventoryPageShell
      title={ui('إدارة الخامات')}
      description={ui('كل نوع في قسم واضح ومستقل، مع نفس دورة الموردين والمشتريات والمخزون')}
    >
      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          const next = new URLSearchParams(searchParams);
          if (tab === 'swap') next.set('tab', 'swap');
          else {
            next.delete('tab');
            next.delete('sourceIngredientId');
          }
          setSearchParams(next, { replace: true });
        }}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-2">
          <TabsTrigger value="materials" className="gap-2 rounded-xl py-2.5"><Boxes className="size-4" />{ui('قائمة الخامات')}</TabsTrigger>
          <TabsTrigger value="swap" className="gap-2 rounded-xl py-2.5"><ArrowLeftRight className="size-4" />{ui('تبديل الخامات')}</TabsTrigger>
        </TabsList>
        <TabsContent value="materials" className="mt-0 space-y-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const open = openSection === section.id;
          return (
            <Card key={section.id} className={cn('overflow-hidden transition-shadow', open && 'shadow-md ring-1 ring-primary/15')}>
              <button
                type="button"
                className="flex w-full items-center gap-3 p-4 text-start"
                onClick={() => setOpenSection(open ? 'general' : section.id)}
                aria-expanded={open}
              >
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', section.tone)}>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{section.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{section.description}</span>
                </span>
                <ChevronDown className={cn('size-5 text-muted-foreground transition-transform', open && 'rotate-180')} />
              </button>
              {open && (
                <CardContent className="border-t bg-muted/10 p-4">
                  <ProductsTab
                    inventoryKind={section.inventoryKind}
                    inventorySection={section.id}
                    createLabel={section.createLabel}
                  />
                </CardContent>
              )}
            </Card>
          );
        })}
        </TabsContent>
        <TabsContent value="swap" className="mt-0"><IngredientSwapWorkspace initialSourceId={initialSourceId} /></TabsContent>
      </Tabs>
    </InventoryPageShell>
  );
}
