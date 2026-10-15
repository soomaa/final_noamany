import { Banknote } from 'lucide-react';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PaidAmountFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

/** Shared high-visibility money input used wherever a form collects a payment. */
export function PaidAmountField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 'any',
  placeholder,
  helperText,
  disabled,
  className,
}: PaidAmountFieldProps) {
  const inputId = useId();

  return (
    <div
      className={cn(
        'rounded-xl border-2 border-emerald-500/35 bg-emerald-500/[0.08] p-3 shadow-[0_8px_24px_rgba(16,185,129,0.09)]',
        'dark:border-emerald-400/30 dark:bg-emerald-400/[0.08]',
        className,
      )}
    >
      <Label htmlFor={inputId} className="mb-2 flex items-center justify-center gap-2 text-center text-sm font-bold text-emerald-800 dark:text-emerald-200">
        <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/15">
          <Banknote className="size-4" aria-hidden />
        </span>
        {label}
      </Label>
      <Input
        id={inputId}
        className="nums h-12 border-emerald-500/40 bg-background text-center text-lg font-bold focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {helperText ? <p className="mt-2 text-center text-xs text-emerald-800/75 dark:text-emerald-200/75">{helperText}</p> : null}
    </div>
  );
}
