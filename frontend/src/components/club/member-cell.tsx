import { toArabicDigits } from '@/lib/utils';
import { MemberAvatar } from './member-avatar';

export interface MemberCellProps {
  name?: string | null;
  code?: string | null;
  memberId?: number | null;
  profilePicture?: string | null;
  /** Shown when member is walk-in / guest without linked member record */
  fallback?: string | null;
  showCode?: boolean;
}

export function MemberCell({
  name,
  code,
  memberId,
  profilePicture,
  fallback,
  showCode = true,
}: MemberCellProps) {
  if (name) {
    return (
      <div className="flex min-w-[120px] items-center gap-2.5">
        <MemberAvatar name={name} profilePicture={profilePicture} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          {showCode && code ? (
            <p className="font-mono text-xs text-muted-foreground nums" dir="ltr">
              {code}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  if (code) {
    return (
      <span className="font-mono text-sm nums" dir="ltr">
        {code}
      </span>
    );
  }
  if (fallback) {
    return <span>{fallback}</span>;
  }
  if (memberId != null) {
    return <span className="nums text-muted-foreground">{toArabicDigits(memberId)}</span>;
  }
  return <span>—</span>;
}
