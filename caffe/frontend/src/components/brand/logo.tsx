import { cn } from '@/lib/utils';

/** Ordera brand mark (full logo with wordmark). */
const LOGO_SRC = '/Ordera.png';
const LOGO_SRC_OPAQUE = '/Ordera.png';

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
  if (variant === 'sidebar') {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <img
          src={LOGO_SRC}
          alt="Ordera"
          className={cn('h-12 w-auto max-w-[11rem] object-contain', imageClassName)}
        />
      </div>
    );
  }

  const onDark = variant === 'on-dark';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src={onDark ? LOGO_SRC : LOGO_SRC_OPAQUE}
        alt="Ordera"
        className={cn(
          'rounded-xl object-contain',
          onDark ? '' : 'object-contain',
          SIZES[size],
          imageClassName,
        )}
      />
      {showText && (
        <div className="leading-tight">
          <div className={cn('text-lg font-bold tracking-wide', onDark ? 'text-white' : 'text-foreground')}>
            Ordera
          </div>
          <div
            className={cn(
              'text-[10px] font-medium tracking-[0.15em]',
              onDark ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            CAFE MANAGEMENT
          </div>
        </div>
      )}
    </div>
  );
}

export { LOGO_SRC, LOGO_SRC_OPAQUE };
