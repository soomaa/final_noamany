import { forwardRef, type ReactNode } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  Beef,
  Beer,
  BicepsFlexed,
  Cake,
  CakeSlice,
  Candy,
  ChefHat,
  CirclePlus,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Dessert,
  Donut,
  Drumstick,
  Egg,
  EggFried,
  Fish,
  Flame,
  ForkKnife,
  ForkKnifeCrossed,
  GlassWater,
  Ham,
  IceCreamBowl,
  Lollipop,
  Martini,
  Milk,
  Nut,
  PackageOpen,
  PillBottle,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  ShoppingBag,
  Soup,
  Store,
  Utensils,
  Wheat,
  Wine,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function createCafeIcon(displayName: string, children: ReactNode): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(
    ({ size = 24, color = 'currentColor', strokeWidth = 2, ...props }, ref) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {children}
      </svg>
    ),
  );
  Icon.displayName = displayName;
  return Icon as LucideIcon;
}

const BurgerIcon = createCafeIcon(
  'BurgerIcon',
  <>
    <path d="M4 11h16" />
    <path d="M5 11a7 7 0 0 1 14 0" />
    <path d="m5 14 2 1 2-1 2 1 2-1 2 1 2-1 2 1" />
    <path d="M5 18h14a2 2 0 0 0 2-2H3a2 2 0 0 0 2 2Z" />
  </>,
);

const WrapIcon = createCafeIcon(
  'WrapIcon',
  <>
    <path d="M7 4h10l-1.5 16h-7Z" />
    <path d="m7.5 7 3-2 2 2 3-2 1.5 2" />
    <path d="m8.5 12 7 4" />
  </>,
);

const FriesIcon = createCafeIcon(
  'FriesIcon',
  <>
    <path d="m7 3 1 7" />
    <path d="m11 2 .5 8" />
    <path d="m15 3-1 7" />
    <path d="m18 4-2 7" />
    <path d="M5 9h14l-2 11H7Z" />
    <path d="M6 13h12" />
  </>,
);

const NoodlesIcon = createCafeIcon(
  'NoodlesIcon',
  <>
    <path d="M4 13h16a8 8 0 0 1-16 0Z" />
    <path d="M7 9c0-2 2-2 2-4" />
    <path d="M12 9c0-2 2-2 2-4" />
    <path d="m17 4 4 7" />
    <path d="m20 3-5 8" />
  </>,
);

const TacoIcon = createCafeIcon(
  'TacoIcon',
  <>
    <path d="M3 17a9 9 0 0 1 18 0Z" />
    <path d="M7 13h.01" />
    <path d="M11 10h.01" />
    <path d="M15 12h.01" />
    <path d="m5 17 2-3 2 3 2-4 2 4 2-3 2 3" />
  </>,
);

const PancakesIcon = createCafeIcon(
  'PancakesIcon',
  <>
    <ellipse cx="12" cy="7" rx="8" ry="3" />
    <path d="M4 7v4c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />
    <path d="M4 11v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" />
    <path d="M10 5.5h4" />
  </>,
);

const WaffleIcon = createCafeIcon(
  'WaffleIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M6.5 6.5 17.5 17.5" />
    <path d="M17.5 6.5 6.5 17.5" />
    <path d="m9 4.5 10.5 10.5" />
    <path d="m4.5 9 10.5 10.5" />
    <path d="m15 4.5-10.5 10.5" />
    <path d="m19.5 9-10.5 10.5" />
  </>,
);

const SmoothieIcon = createCafeIcon(
  'SmoothieIcon',
  <>
    <path d="M7 7h10l-1 13H8Z" />
    <path d="M6 4h12" />
    <path d="m15 4 2-3" />
    <path d="m11 10 2 2 2-2" />
  </>,
);

const IcedCoffeeIcon = createCafeIcon(
  'IcedCoffeeIcon',
  <>
    <path d="M7 6h10l-1 14H8Z" />
    <path d="M6 3h12" />
    <path d="m15 3 2-2" />
    <path d="m9 10 2-2 2 2 2-2" />
    <path d="M8 14h8" />
  </>,
);

const TeaIcon = createCafeIcon(
  'TeaIcon',
  <>
    <path d="M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
    <path d="M17 12h2a2 2 0 0 1 0 4h-2" />
    <path d="M8 6c0-2 2-2 2-4" />
    <path d="M12 6c0-2 2-2 2-4" />
  </>,
);

const ProteinBarIcon = createCafeIcon(
  'ProteinBarIcon',
  <>
    <path d="m5 6 14 2-2 10-14-2Z" />
    <path d="m8 7-1 10" />
    <path d="m16 8-1 10" />
    <path d="M10 12h4" />
  </>,
);

const RiceBowlIcon = createCafeIcon(
  'RiceBowlIcon',
  <>
    <path d="M4 11h16a8 8 0 0 1-16 0Z" />
    <path d="M6 11a6 5 0 0 1 12 0" />
    <path d="M8 8h.01" />
    <path d="M12 6h.01" />
    <path d="M16 8h.01" />
  </>,
);

const HotDogIcon = createCafeIcon(
  'HotDogIcon',
  <>
    <path d="M5 17a3 3 0 0 1 0-6l12-5a3 3 0 0 1 2 6Z" />
    <path d="M5 14 18 9" />
    <path d="m7 11 2 1 2-2 2 1 2-2" />
  </>,
);

export interface CafeCategoryIconOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

export const CAFE_CATEGORY_ICON_GROUPS: Array<{
  title: string;
  items: CafeCategoryIconOption[];
}> = [
  {
    title: 'مشروبات الكافيه',
    items: [
      { value: 'icon:coffee', label: 'قهوة ومشروبات ساخنة', icon: Coffee },
      { value: 'icon:tea', label: 'شاي وماتشا', icon: TeaIcon },
      { value: 'icon:iced-coffee', label: 'قهوة مثلجة', icon: IcedCoffeeIcon },
      { value: 'icon:cup-soda', label: 'مشروبات باردة', icon: CupSoda },
      { value: 'icon:smoothie', label: 'سموزي وعصائر', icon: SmoothieIcon },
      { value: 'icon:glass-water', label: 'مياه', icon: GlassWater },
      { value: 'icon:milk', label: 'ميلك شيك وسموزي', icon: Milk },
      { value: 'icon:martini', label: 'كوكتيلات', icon: Martini },
      { value: 'icon:wine', label: 'مشروبات مميزة', icon: Wine },
      { value: 'icon:beer', label: 'مشروبات كانز', icon: Beer },
      { value: 'icon:biceps', label: 'بروتين شيك', icon: BicepsFlexed },
      { value: 'icon:supplements', label: 'مكملات', icon: PillBottle },
      { value: 'icon:protein-bar', label: 'بروتين بار', icon: ProteinBarIcon },
    ],
  },
  {
    title: 'الفطار والوجبات',
    items: [
      { value: 'icon:egg-fried', label: 'فطار وبيض', icon: EggFried },
      { value: 'icon:egg', label: 'بيض', icon: Egg },
      { value: 'icon:croissant', label: 'مخبوزات', icon: Croissant },
      { value: 'icon:pancakes', label: 'بان كيك', icon: PancakesIcon },
      { value: 'icon:waffle', label: 'وافل', icon: WaffleIcon },
      { value: 'icon:soup', label: 'شوربة', icon: Soup },
      { value: 'icon:salad', label: 'سلطات ووجبات صحية', icon: Salad },
      { value: 'icon:pizza', label: 'بيتزا', icon: Pizza },
      { value: 'icon:sandwich', label: 'ساندوتشات', icon: Sandwich },
      { value: 'icon:burger', label: 'برجر', icon: BurgerIcon },
      { value: 'icon:wrap', label: 'راب', icon: WrapIcon },
      { value: 'icon:taco', label: 'تاكو', icon: TacoIcon },
      { value: 'icon:hot-dog', label: 'هوت دوج', icon: HotDogIcon },
      { value: 'icon:fries', label: 'بطاطس ومقبلات', icon: FriesIcon },
      { value: 'icon:beef', label: 'لحوم وبروتين', icon: Beef },
      { value: 'icon:drumstick', label: 'فراخ', icon: Drumstick },
      { value: 'icon:fish', label: 'أسماك', icon: Fish },
      { value: 'icon:ham', label: 'وجبات رئيسية', icon: Ham },
      { value: 'icon:cooking-pot', label: 'أطباق مطهية', icon: CookingPot },
      { value: 'icon:noodles', label: 'نودلز وباستا', icon: NoodlesIcon },
      { value: 'icon:rice-bowl', label: 'أرز وباولز', icon: RiceBowlIcon },
      { value: 'icon:wheat', label: 'حبوب ومخبوزات', icon: Wheat },
    ],
  },
  {
    title: 'حلويات وسناكس',
    items: [
      { value: 'icon:cake', label: 'كيك وحلويات', icon: CakeSlice },
      { value: 'icon:whole-cake', label: 'تورت وكيك', icon: Cake },
      { value: 'icon:dessert', label: 'ديسرت', icon: Dessert },
      { value: 'icon:cookie', label: 'كوكيز', icon: Cookie },
      { value: 'icon:donut', label: 'دونات', icon: Donut },
      { value: 'icon:ice-cream', label: 'آيس كريم', icon: IceCreamBowl },
      { value: 'icon:candy', label: 'حلويات صغيرة', icon: Candy },
      { value: 'icon:lollipop', label: 'كاندي', icon: Lollipop },
      { value: 'icon:popcorn', label: 'سناكس', icon: Popcorn },
      { value: 'icon:nuts', label: 'مكسرات', icon: Nut },
      { value: 'icon:flame', label: 'اختيارات ساخنة', icon: Flame },
    ],
  },
  {
    title: 'تقديم ومتجر',
    items: [
      { value: 'icon:utensils', label: 'كل الأصناف', icon: Utensils },
      { value: 'icon:fork-knife', label: 'أطباق رئيسية', icon: ForkKnife },
      { value: 'icon:fork-knife-crossed', label: 'مطعم', icon: ForkKnifeCrossed },
      { value: 'icon:chef-hat', label: 'اختيارات الشيف', icon: ChefHat },
      { value: 'icon:package-open', label: 'تيك أواي', icon: PackageOpen },
      { value: 'icon:shopping-bag', label: 'هيلثي ماركت', icon: ShoppingBag },
      { value: 'icon:store', label: 'منتجات المتجر', icon: Store },
      { value: 'icon:addons', label: 'إضافات', icon: CirclePlus },
    ],
  },
];

const ICON_BY_VALUE = new Map(
  CAFE_CATEGORY_ICON_GROUPS.flatMap((group) => group.items).map((item) => [item.value, item.icon]),
);

export function CafeCategoryIcon({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  const Icon = ICON_BY_VALUE.get(value ?? '') ?? Utensils;
  return <Icon aria-hidden="true" strokeWidth={1.9} className={cn('size-5', className)} />;
}
