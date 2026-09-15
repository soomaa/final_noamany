import * as React from 'react';
import { cn } from '@/lib/utils';
import * as Popover from '@radix-ui/react-popover';
import { useTouchKeypad } from './touch-keypad-context';
import { TouchKeypad } from './touch-keypad';
import { enterKey, normalizeKeypadDigits, preferredKeypadSide } from '@/lib/touch-keypad';
import { useLocale } from '@/store/locale';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { touchSummary?: React.ReactNode; touchTitle?: string };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, touchSummary, touchTitle, ...props }, ref) => {
    const enabled = useTouchKeypad();
    const { ui } = useLocale();
    const [open, setOpen] = React.useState(false);
    const [side, setSide] = React.useState<'right' | 'bottom'>('right');
    const [localValue, setLocalValue] = React.useState(String(props.defaultValue ?? ''));
    const [title, setTitle] = React.useState('');
    const replace = React.useRef(true);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const active = enabled && !props.readOnly && !props.disabled && (type === 'number' || type === 'tel' || props.inputMode === 'tel' || props.inputMode === 'decimal' || props.inputMode === 'numeric');
    const decimal = type !== 'tel' && props.inputMode !== 'tel' && props.inputMode !== 'numeric' && String(props.step ?? '') !== '1';
    const value = props.value !== undefined ? String(props.value) : localValue;
    const updateSide = React.useCallback(() => {
      const bounds = inputRef.current?.getBoundingClientRect();
      if (bounds) setSide(preferredKeypadSide(window.innerWidth, bounds));
    }, []);
    React.useEffect(() => {
      if (!open) return;
      window.addEventListener('resize', updateSide);
      return () => window.removeEventListener('resize', updateSide);
    }, [open, updateSide]);
    const updateOpen = (next: boolean) => {
      if (next) updateSide();
      setOpen(next);
      if (next && !open) replace.current = true;
    };
    const input = <input
      type={active ? 'text' : type}
      ref={(node) => { inputRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
      className={cn(
        'flex h-10 w-full rounded-[10px] border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors',
        'dark:bg-[rgba(255,255,255,.04)] dark:border-[rgba(255,255,255,.09)] dark:text-[#D4CBCD] dark:shadow-none',
        'placeholder:text-muted-foreground dark:placeholder:text-[#8E8486]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
        'dark:focus-visible:border-[rgba(111,183,230,.5)] dark:focus-visible:ring-[rgba(111,183,230,.2)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
      inputMode={active ? 'none' : props.inputMode}
      readOnly={props.readOnly}
      onClick={(event) => {
        props.onClick?.(event);
        if (active) {
          setTitle(touchTitle || props['aria-label'] || inputRef.current?.labels?.[0]?.textContent || inputRef.current?.parentElement?.parentElement?.querySelector('label')?.textContent || ui('إدخال الرقم'));
          updateOpen(true);
        }
      }}
      onChange={(event) => {
        if (active) {
          const next = normalizeKeypadDigits(event.target.value);
          const valid = decimal ? /^[+-]?\d*(?:\.\d*)?$/.test(next) : /^\+?\d*$/.test(next);
          if (!valid) { event.target.value = value; return; }
          if (next !== event.target.value) event.target.value = next;
          replace.current = false;
        }
        setLocalValue(event.target.value);
        props.onChange?.(event);
      }}
    />;
    if (!active) return input;
    return <Popover.Root open={open} onOpenChange={updateOpen}><Popover.Anchor asChild>{input}</Popover.Anchor><Popover.Portal><Popover.Content
      aria-label={ui('لوحة الأرقام')}
      side={side} align="center" sideOffset={8} collisionPadding={12}
      className="pointer-events-auto z-[100] w-[360px] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-2xl border bg-card p-3 text-foreground shadow-xl"
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onFocusOutside={(event) => { if (event.target === inputRef.current) event.preventDefault(); }}
    ><TouchKeypad value={value} title={title} decimal={decimal} summary={touchSummary} close={() => updateOpen(false)} press={(key) => {
      const next = enterKey(value, key, { decimal, decimalPlaces: String(props.step ?? '').includes('.') ? String(props.step).split('.')[1].length : 6, replace: replace.current, maxLength: props.maxLength ?? 12 });
      replace.current = false;
      const node = inputRef.current;
      if (!node) return;
      node.value = next;
      setLocalValue(next);
      props.onChange?.({ target: node, currentTarget: node } as React.ChangeEvent<HTMLInputElement>);
    }} /></Popover.Content></Popover.Portal></Popover.Root>;
  },
);
Input.displayName = 'Input';
