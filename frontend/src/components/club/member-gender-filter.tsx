import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { lockedMemberGender, MEMBER_GENDER_OPTIONS, preferredMemberGender, type MemberGender } from '@/lib/user-scope';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';

/** 'all' or one section. Send it to the API as `gender` (omit or 'all' = both sections). */
export type MemberGenderValue = 'all' | MemberGender;

/**
 * The رجالي/حريمي/الكل filter for club screens kept in local state.
 * Starts on the logged-in employee's section; a one-section employee cannot change it
 * (the backend refuses the other section anyway). Admins and «الكل» staff start on الكل.
 */
export function useMemberGenderFilter() {
  const user = useAuth((s) => s.user);
  const locked = lockedMemberGender(user);
  const [chosen, setChosen] = useState<MemberGenderValue>(locked ?? preferredMemberGender(user) ?? 'all');
  const value: MemberGenderValue = locked ?? chosen;
  return {
    value,
    locked,
    setValue: (next: MemberGenderValue) => {
      if (!locked) setChosen(next);
    },
    /** `gender` query param for the API: undefined when both sections are shown. */
    param: value === 'all' ? undefined : value,
  };
}

/** FilterBar field for URL-param list pages (key `gender`), locked for one-section staff. */
export function useMemberGenderFilterField(label = 'رجالي/حريمي') {
  const user = useAuth((s) => s.user);
  return {
    key: 'gender',
    label,
    type: 'select' as const,
    options: MEMBER_GENDER_OPTIONS,
    lockedValue: lockedMemberGender(user) ?? undefined,
    defaultValue: preferredMemberGender(user) ?? undefined,
  };
}

interface MemberGenderSelectProps {
  value: MemberGenderValue;
  onChange: (value: MemberGenderValue) => void;
  locked?: MemberGender | null;
  label?: string;
  className?: string;
  /** Hide the label (e.g. inside a toolbar). */
  hideLabel?: boolean;
}

export function MemberGenderSelect({ value, onChange, locked, label = 'رجالي/حريمي', className, hideLabel }: MemberGenderSelectProps) {
  return (
    <div className={cn('min-w-[140px]', className)}>
      {!hideLabel && <Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>}
      <Select value={locked ?? value} disabled={locked != null} onValueChange={(v) => onChange(v as MemberGenderValue)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">الكل</SelectItem>
          {MEMBER_GENDER_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
