import { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import { Loader2, ScanBarcode, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';

export interface ReceptionMemberSearchBoxHandle {
  focus: () => void;
}

interface ReceptionMemberSearchBoxProps {
  value: string;
  tabletMode: boolean;
  searching: boolean;
  onQueryChange: (value: string) => void;
  onDraftChange?: () => void;
  onSubmit: (value: string) => void;
  onOpenCamera: () => void;
}

/**
 * Keeps keystrokes local so the large reception workspace is not rendered for
 * every character. Remote search is committed only after the operator pauses.
 */
export const ReceptionMemberSearchBox = memo(forwardRef<
  ReceptionMemberSearchBoxHandle,
  ReceptionMemberSearchBoxProps
>(function ReceptionMemberSearchBox({
  value,
  tabletMode,
  searching,
  onQueryChange,
  onDraftChange,
  onSubmit,
  onOpenCamera,
}, ref) {
  const { ui } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useDebouncedSearch(value, onQueryChange, 200);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }), []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          className={cn(tabletMode ? 'h-16 ps-12 text-xl' : 'h-14 ps-11 text-lg', 'rounded-2xl')}
          placeholder={ui('اسم · موبايل · كود · باركود · رقم قومي')}
          aria-label={ui('بحث سريع عن العضو')}
          value={search.draft}
          onChange={(event) => {
            onDraftChange?.();
            search.change(event.target.value);
          }}
          onCompositionStart={search.onCompositionStart}
          onCompositionEnd={(event) => search.onCompositionEnd(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            onSubmit(search.flush());
          }}
          autoFocus
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        permissionAction={null}
        className={cn('rounded-2xl px-5', tabletMode ? 'h-16' : 'h-14')}
        onClick={onOpenCamera}
      >
        <ScanBarcode className="size-5" /> {ui('مسح بالكاميرا')}
      </Button>
      <Button
        type="button"
        variant="brand"
        size="lg"
        className={cn('rounded-2xl px-8', tabletMode ? 'h-16' : 'h-14')}
        onClick={() => {
          onSubmit(search.flush());
        }}
        aria-busy={searching}
      >
        {searching ? <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : <Search aria-hidden="true" className="size-5" />} {ui('بحث')}
      </Button>
    </div>
  );
}));
