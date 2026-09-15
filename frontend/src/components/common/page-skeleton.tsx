import { useLocale } from '@/store/locale';
import { Skeleton } from '@/components/ui/skeleton';

export function PageSkeleton() {
  const { ui } = useLocale();
  return (
    <div className="space-y-6 animate-fade-in" role="status" aria-label={ui('جاري تحميل الصفحة')}>
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
