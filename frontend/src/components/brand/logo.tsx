import { cn } from '@/lib/utils';
import { getBrandProfile } from '@/ports/brand-registry';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  imageClassName?: string;
  variant?: 'default' | 'on-dark' | 'sidebar';
}

const SIZES = {
  sm: 'h-9 w-auto max-w-[7.5rem]',
  md: 'h-11 w-auto max-w-[9rem]',
  lg: 'h-16 w-auto max-w-[12rem]',
  xl: 'h-24 w-auto max-w-[16rem]',
};

export function BrandLogo({
  size = 'md',
  showText = false,
  className,
  imageClassName,
  variant = 'default',
}: BrandLogoProps) {
  const brand = getBrandProfile();
  const source = variant === 'on-dark' ? brand.logoSrc : (brand.opaqueLogoSrc ?? brand.logoSrc);
  if (variant === 'sidebar') {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        {brand.logoSrc ? (
          <img src={brand.logoSrc} alt={brand.name} className={cn('h-12 w-auto max-w-[11rem] object-contain', imageClassName)} />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">{brand.mark}</span>
        )}
      </div>
    );
  }

  const onDark = variant === 'on-dark';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {source ? (
        <img src={source} alt={brand.name} className={cn('rounded-xl object-contain', onDark ? '' : 'bg-neutral-950 p-1 shadow-md ring-1 ring-primary/20', SIZES[size], imageClassName)} />
      ) : (
        <span className={cn('flex items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground', SIZES[size])}>{brand.mark}</span>
      )}
      {showText && (
        <div className="leading-tight">
          <div className={cn('text-lg font-bold tracking-wide', onDark ? 'text-white' : 'text-foreground')}>
            {brand.name}
          </div>
          <div
            className={cn(
              'text-[10px] font-medium tracking-[0.15em]',
              onDark ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            {brand.tagline}
          </div>
        </div>
      )}
    </div>
  );
}

