import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Combobox, type ComboboxOption } from '@/components/common/combobox';
import { cn } from '@/lib/utils';

/** Lists longer than this get a search box; shorter ones stay a plain dropdown. */
const SEARCH_THRESHOLD = 7;

interface SearchableSelectProps {
  value?: string | number | readonly string[] | null;
  /** Same shape as a native select's onChange, so call sites don't change. */
  onChange?: (event: { target: { value: string } }) => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  title?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  /** Force the search box (true) or the plain dropdown (false); default: by list length. */
  searchable?: boolean;
}

interface ParsedOption {
  value: string;
  label: string;
  disabled: boolean;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** Flatten <option> children (through fragments, arrays and <optgroup>) into a list. */
function parseOptions(children: ReactNode, out: ParsedOption[] = []): ParsedOption[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; value?: unknown; disabled?: boolean; label?: string }>(child)) return;
    if (child.type === Fragment || child.type === 'optgroup') {
      parseOptions(child.props.children, out);
      return;
    }
    if (child.type !== 'option') return;
    const label = (child.props.label ?? textOf(child.props.children)).trim();
    const value = child.props.value != null ? String(child.props.value) : label;
    out.push({ value, label, disabled: !!child.props.disabled });
  });
  return out;
}

/**
 * Drop-in replacement for a native <select> with <option> children. Long lists open a search box
 * (Arabic-aware: أ/ا، ة/ه، ى/ي، and Arabic digits match); short lists stay a native dropdown.
 */
export function SearchableSelect({
  value,
  onChange,
  children,
  className,
  disabled,
  id,
  name,
  required,
  title,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  searchable,
}: SearchableSelectProps) {
  const parsed = parseOptions(children);
  // An empty-value option ("اختر…", "الكل", "منتج") is the placeholder, not a search result.
  const placeholderOption = parsed.find((o) => o.value === '');
  const choices = parsed.filter((o) => o.value !== '' && !o.disabled);
  const useSearch = searchable ?? choices.length > SEARCH_THRESHOLD;
  const current = value == null ? '' : String(value);

  if (!useSearch) {
    return (
      <select
        value={current}
        onChange={(e) => onChange?.({ target: { value: e.target.value } })}
        className={className}
        disabled={disabled}
        id={id}
        name={name}
        required={required}
        title={title}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
      >
        {children}
      </select>
    );
  }

  // Keep the placeholder selectable when it means something (e.g. "الكل"), so a filter can be cleared.
  const options: ComboboxOption[] = [
    ...(placeholderOption && !placeholderOption.disabled && !required ? [{ value: '', label: placeholderOption.label }] : []),
    ...choices.map((o) => ({ value: o.value, label: o.label })),
  ];

  return (
    <>
      <Combobox
        id={id}
        value={current}
        onValueChange={(v) => onChange?.({ target: { value: v } })}
        options={options}
        placeholder={placeholderOption?.label || undefined}
        disabled={disabled}
        aria-label={ariaLabel ?? title}
        className={cn('h-10 bg-card px-3', className, 'justify-between')}
      />
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </>
  );
}
