import { type ReactNode } from 'react';
import { Combobox } from '@/components/common/combobox';
import { optionsFrom } from '@/lib/select-options';

/**
 * A `<select>`-shaped door onto {@link Combobox}.
 *
 * A native dropdown is drawn by the operating system: it cannot be styled to match the app,
 * and it cannot carry a search box. On the long lists — every coach in the club, every
 * member, every class — that made them both ugly and slow to aim.
 *
 * Rewriting each call site into Combobox's `options` array would have been a large, risky
 * diff across the app. This reads the `<option>` children a call site already has instead,
 * so converting a list is a one-line change and the options stay written where they were,
 * in the order they were.
 */
export function SelectField({
  value,
  onChange,
  children,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
  searchPlaceholder,
  placeholder,
}: {
  /** Numbers are accepted because plenty of call sites hold an id, exactly as `<select>` did. */
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  searchPlaceholder?: string;
  placeholder?: string;
}) {
  return (
    <Combobox
      id={id}
      value={value == null ? '' : String(value)}
      onValueChange={onChange}
      options={optionsFrom(children)}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
      searchPlaceholder={searchPlaceholder}
      placeholder={placeholder}
    />
  );
}
