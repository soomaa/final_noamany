import { useState } from 'react';
import { memberAvatarUrl } from '@/lib/member-photo';
import { cn } from '@/lib/utils';

export interface MemberAvatarProps {
  name?: string | null;
  profilePicture?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeCls = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-20 text-2xl',
};

export function memberInitials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

export function MemberAvatar({ name, profilePicture, size = 'md', className }: MemberAvatarProps) {
  const url = memberAvatarUrl(profilePicture);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const cls = sizeCls[size];

  // Fall back to initials when the file itself is missing too, so an image that never
  // made it across from the old server degrades to the avatar instead of a broken icon.
  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailedUrl(url)}
        className={cn(cls, 'shrink-0 rounded-full object-cover ring-1 ring-border', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        cls,
        'flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary',
        className,
      )}
    >
      {memberInitials(name)}
    </div>
  );
}
