import { useState } from 'react';
import { uploadUrl } from '@/components/employees/use-uploads';
import { cn } from '@/lib/utils';

export interface MemberAvatarProps {
  name?: string | null;
  profilePicture?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'portrait';
  className?: string;
}

const sizeCls = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-20 text-2xl',
  xl: 'size-32 text-3xl sm:size-36',
  /** Reception identity photo (as in MetaFit): full card width. */
  portrait: 'aspect-[4/3] w-full text-4xl',
};

export function memberInitials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

export function MemberAvatar({ name, profilePicture, size = 'md', className }: MemberAvatarProps) {
  const url = uploadUrl(profilePicture);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const cls = sizeCls[size];

  // A photo that never made it across from the old server falls back to the initials,
  // instead of an empty box with a broken-image icon.
  if (url && failedUrl !== url) {
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
