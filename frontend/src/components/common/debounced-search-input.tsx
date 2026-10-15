import { memo, type Ref } from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';

type Props = Omit<InputProps, 'value' | 'defaultValue' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  delay?: number;
  inputRef?: Ref<HTMLInputElement>;
};

/** Only this input renders on a keystroke, even inside a large table/workspace. */
export const DebouncedSearchInput = memo(function DebouncedSearchInput({
  value, onValueChange, delay, inputRef, onKeyDown, onCompositionStart, onCompositionEnd, ...props
}: Props) {
  const search = useDebouncedSearch(value, onValueChange, delay);
  return <Input
    {...props}
    ref={inputRef}
    value={search.draft}
    onChange={(event) => search.change(event.target.value)}
    onCompositionStart={(event) => { search.onCompositionStart(); onCompositionStart?.(event); }}
    onCompositionEnd={(event) => { search.onCompositionEnd(event.currentTarget.value); onCompositionEnd?.(event); }}
    onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) search.flush();
      onKeyDown?.(event);
    }}
  />;
});
