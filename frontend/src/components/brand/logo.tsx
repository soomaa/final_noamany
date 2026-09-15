import { cn } from '@/lib/utils';

/** Primary Noamany Fitness Center brand mark. */
const LOGO_SRC = '/noamany-logo.png';
const LOGO_SRC_OPAQUE = '/noamany-logo.png';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  imageClassName?: string;
  variant?: 'default' | 'on-dark' | 'sidebar';
}

const SIZES = {
  sm: 'h-14 w-auto max-w-[13rem]',
  md: 'h-20 w-auto max-w-[17rem]',
  lg: 'h-28 w-auto max-w-[22rem]',
  xl: 'h-36 w-auto max-w-[28rem]',
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
      <div className={cn('relative w-full max-w-[18rem] overflow-hidden rounded-2xl bg-gradient-to-br from-white via-[#FFF5F5] to-brand-100 p-3', className)}>
        <img
          src={LOGO_SRC}
          alt="Noamany Fitness Center"
          className={cn('relative mx-auto h-28 w-full object-contain', imageClassName)}
        />
      </div>
    );
  }

  const onDark = variant === 'on-dark';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'overflow-hidden rounded-2xl p-2',
          onDark
            ? 'bg-gradient-to-br from-white via-[#FFF5F5] to-brand-100 shadow-[0_12px_32px_-10px_rgba(237,28,36,0.45)]'
            : 'bg-white shadow-md ring-1 ring-primary/15',
        )}
      >
        <img
          src={onDark ? LOGO_SRC : LOGO_SRC_OPAQUE}
          alt="Noamany Fitness Center"
          className={cn('object-contain', SIZES[size], imageClassName)}
        />
      </div>
      {showText && (
        <div className="leading-tight">
          <div className={cn('text-lg font-bold tracking-wide', onDark ? 'text-white' : 'text-foreground')}>
            NOAMANY
          </div>
          <div
            className={cn(
              'text-[10px] font-medium tracking-[0.15em]',
              onDark ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            FITNESS CENTER
          </div>
        </div>
      )}
    </div>
  );
}

export { LOGO_SRC, LOGO_SRC_OPAQUE };
