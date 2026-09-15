import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox, type ComboboxOption } from '@/components/common/combobox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatDate, formatHijriDisplay } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface FieldWrapperProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FieldWrapper({ label, error, required, hint, children, className }: FieldWrapperProps) {
  const { ui } = useLocale();
  return (
    <div
      className={cn(
        'space-y-2',
        required && 'rounded-xl border border-primary/30 bg-primary/[0.04] p-3 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.06)]',
        className,
      )}
    >
      <Label className={cn('flex flex-wrap items-center gap-2', required && 'font-semibold text-foreground')}>
        <span>{label}</span>
        {required && (
          <span className="inline-flex items-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-destructive">
            {ui('مطلوب')}
          </span>
        )}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface DualDateFieldProps {
  label: string;
  gregorianValue?: string;
  hijriValue?: string;
  onGregorianChange: (v: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Keep legacy Hijri display only where it is explicitly needed. */
  showHijri?: boolean;
  /** Hide the redundant Gregorian sub-label when the field already has a clear title. */
  showGregorianLabel?: boolean;
}

/** Paired Hijri+Gregorian — stores Gregorian; displays both per legacy dual-date convention */
export function DualDateField({
  label,
  gregorianValue,
  hijriValue,
  onGregorianChange,
  error,
  required,
  disabled,
  showHijri = true,
  showGregorianLabel = true,
}: DualDateFieldProps) {
  const { ui } = useLocale();
  return (
    <FieldWrapper label={label} error={error} required={required}>
      <div className={cn('grid grid-cols-1 gap-2', showHijri && 'sm:grid-cols-2')}>
        <div>
          {showGregorianLabel && (
            <Label className="mb-1 block text-xs text-muted-foreground">{ui('ميلادي')}</Label>
          )}
          <Input
            type="date"
            value={gregorianValue ?? ''}
            onChange={(e) => onGregorianChange(e.target.value)}
            disabled={disabled}
          />
        </div>
        {showHijri && <div>
          <Label className="mb-1 block text-xs text-muted-foreground">{ui('هجري (عرض)')}</Label>
          <Input
            readOnly
            value={hijriValue ?? formatHijriDisplay(gregorianValue)}
            className="bg-muted"
            tabIndex={-1}
          />
        </div>}
      </div>
    </FieldWrapper>
  );
}

interface RHFSelectProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}

export function RHFSelect<T extends FieldValues>({ control, name, label, options, required, placeholder }: RHFSelectProps<T>) {
  const { ui } = useLocale();
  const useCombobox = options.length > 8;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldWrapper label={label} error={fieldState.error?.message} required={required}>
          {useCombobox ? (
            <Combobox
              value={field.value ?? ''}
              onValueChange={field.onChange}
              options={options}
              placeholder={placeholder ?? label}
              searchPlaceholder={ui(`بحث في ${label}…`)}
            />
          ) : (
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder={placeholder ?? label} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldWrapper>
      )}
    />
  );
}

export function RHFCombobox<T extends FieldValues>({
  control,
  name,
  label,
  options,
  required,
  placeholder,
}: RHFSelectProps<T>) {
  const { ui } = useLocale();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldWrapper label={label} error={fieldState.error?.message} required={required}>
          <Combobox
            value={field.value ?? ''}
            onValueChange={field.onChange}
            options={options}
            placeholder={placeholder ?? label}
            searchPlaceholder={ui(`بحث في ${label}…`)}
          />
        </FieldWrapper>
      )}
    />
  );
}

export function RHFTextarea<T extends FieldValues>({
  control,
  name,
  label,
  required,
  rows = 3,
  hint,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  required?: boolean;
  rows?: number;
  hint?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldWrapper label={label} error={fieldState.error?.message} required={required} hint={hint}>
          <Textarea {...field} rows={rows} />
        </FieldWrapper>
      )}
    />
  );
}

export function RHFSwitch<T extends FieldValues>({ control, name, label }: { control: Control<T>; name: FieldPath<T>; label: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label>{label}</Label>
          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  );
}

export function RHFRadio<T extends FieldValues>({
  control,
  name,
  label,
  options,
  required,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldWrapper label={label} error={fieldState.error?.message} required={required}>
          <RadioGroup value={field.value ?? ''} onValueChange={field.onChange} className="flex flex-wrap gap-4">
            {options.map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <RadioGroupItem value={o.value} id={`${name}-${o.value}`} />
                <Label htmlFor={`${name}-${o.value}`}>{o.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </FieldWrapper>
      )}
    />
  );
}

export { Input, Textarea, formatDate };
