import { Loader2, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useClubT } from '@/hooks/use-club-t';
import { api } from '@/lib/api';
import { isMemberSearchReady, searchClubMembers } from '@/lib/club-member-search';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import type { ClubSearchHit } from '@/types/gym-ops';

interface MemberSearchComboboxProps {
  id?: string;
  selectedMember: ClubMemberListItem | null;
  isolated?: boolean;
  onSelect: (member: ClubMemberListItem) => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
  /** Only members of this branch are offered (the form's branch). */
  branchId?: number;
}

export function MemberSearchCombobox({
  id,
  selectedMember,
  isolated = false,
  onSelect,
  onClear,
  disabled,
  className,
  branchId,
}: MemberSearchComboboxProps) {
  const ct = useClubT();
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ClubSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (selectedMember) {
      setQuery(`${selectedMember.name} · ${selectedMember.memberCode}`);
      setOpen(false);
      setHits([]);
    }
  }, [selectedMember]);

  useEffect(() => {
    if (disabled || selectedMember) { setLoading(false); return; }
    const trimmed = query.trim();
    if (!isMemberSearchReady(trimmed)) {
      setHits([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    // A branch change must not leave another branch's hits (or a late response) on screen.
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setHits([]);
    setOpen(false);
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const result = isolated ? { hits: (await api.get<{ data: ClubSearchHit[] }>('/club-membership-registration/members', { params: { search: trimmed, branchId }, signal: controller.signal })).data.data } : await searchClubMembers(trimmed, { branchId, signal: controller.signal });
          if (cancelled) return;
          setHits(result.hits);
          setOpen(result.hits.length > 0);
          setActiveIndex(0);
        } catch {
          if (cancelled) return;
          setHits([]);
          setOpen(false);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, disabled, selectedMember, branchId, isolated]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pickHit = async (hit: ClubSearchHit) => {
    setLoading(true);
    try {
      const { data } = await api.get<ClubMemberListItem>(isolated ? `/club-membership-registration/members/${hit.id}` : `/club-members/${hit.id}`);
      onSelect(data);
      setQuery(`${data.name} · ${data.memberCode}`);
      setOpen(false);
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    onClear();
    setQuery('');
    setHits([]);
    setOpen(false);
  };

  const onInputChange = (value: string) => {
    if (selectedMember) {
      clearSelection();
    }
    setQuery(value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && hits[activeIndex]) {
      e.preventDefault();
      void pickHit(hits[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          className="ps-9 pe-9"
          value={query}
          role="combobox"
          aria-label={ct('subscriptions.memberSearchPlaceholder')}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && hits[activeIndex] ? `${listId}-${hits[activeIndex].id}` : undefined}
          aria-busy={loading}
          disabled={disabled}
          placeholder={ct('subscriptions.memberSearchPlaceholder')}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => {
            if (!selectedMember && hits.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        {(loading || selectedMember) && (
          <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {selectedMember && !disabled && (
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={clearSelection}
                aria-label={ct('common.cancel')}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {open && !selectedMember && (
        <ul
          id={listId}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md"
          role="listbox"
        >
          {hits.map((hit, index) => (
            <li key={hit.id}>
              <button
                type="button"
                role="option"
                id={`${listId}-${hit.id}`}
                aria-selected={index === activeIndex}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-muted',
                  index === activeIndex && 'bg-muted',
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void pickHit(hit)}
              >
                <span className="font-medium">{hit.name}</span>
                <span className="nums text-xs text-muted-foreground font-mono">{hit.memberCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!selectedMember && query.trim().length > 0 && !isMemberSearchReady(query) && (
        <p className="mt-1 text-xs text-muted-foreground">{ct('subscriptions.memberSearchMinChars')}</p>
      )}

      {!loading && !selectedMember && isMemberSearchReady(query) && hits.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{ct('members.noMemberFound')}</p>
      )}

      {selectedMember?.phone && (
        <p className="mt-1 text-xs text-muted-foreground nums">
          {formatDigits(selectedMember.phone)}
        </p>
      )}
    </div>
  );
}
