import { Building2 } from 'lucide-react';
import { MemberAvatar } from '@/components/club/member-avatar';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { BlockedChip } from '@/components/club/blocked-member-flag';
import { normalizeScannedCode } from '@/lib/scanned-code';

export { normalizeScannedCode };
import type { ClubSearchHit } from '@/types/gym-ops';

/** Reception's member search (`/club/search`): name, mobile, member code, card/barcode, national ID. */
export interface ClubMemberSearchResult {
  hits: ClubSearchHit[];
  topMatch: ClubSearchHit | null;
}

export const CLUB_MEMBER_SEARCH_MIN_CHARS = 2;


export async function searchClubMembersUniversal(
  q: string,
  options: { branchId?: number | string; withEntitlement?: boolean; signal?: AbortSignal } = {},
): Promise<ClubMemberSearchResult> {
  const { data } = await api.get<ClubMemberSearchResult | ClubSearchHit[]>('/club/search', {
    params: {
      q: normalizeScannedCode(q),
      ...(options.withEntitlement ? { withEntitlement: true } : {}),
      branchId: options.branchId || undefined,
    },
    signal: options.signal,
  });
  // Without withEntitlement the endpoint returns the ranked hits only.
  if (Array.isArray(data)) return { hits: data, topMatch: data[0] ?? null };
  return data;
}

/** A hit the query names exactly by member code or card/barcode — what a scanner produces. */
export function exactCodeHit(result: ClubMemberSearchResult, q: string): ClubSearchHit | null {
  const value = normalizeScannedCode(q).toLowerCase();
  return (
    result.hits.find((hit) => hit.memberCode.toLowerCase() === value) ??
    result.hits.find((hit) => hit.matchType === 'code' || hit.matchType === 'card') ??
    null
  );
}

/** The member Enter should open: the code always wins over name and mobile matches. */
export function preferredSearchHit(result: ClubMemberSearchResult, q: string): ClubSearchHit | null {
  return exactCodeHit(result, q) ?? result.topMatch ?? result.hits[0] ?? null;
}

/** Result list under the search box, shared by reception and the check-in desk. */
export function ClubMemberSearchHits({
  hits,
  onSelect,
  branchLabel,
}: {
  hits: ClubSearchHit[];
  onSelect: (hit: ClubSearchHit) => void;
  /** Shown as a chip when the desk searches several branches. */
  branchLabel?: (hit: ClubSearchHit) => string | null;
}) {
  return (
    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-2xl border bg-muted/20 p-2">
      {hits.map((h) => {
        const branch = branchLabel?.(h);
        return (
          <button
            key={h.id}
            type="button"
            onClick={() => onSelect(h)}
            className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-card px-3 py-3 text-start transition hover:border-primary/30 hover:bg-primary/5"
          >
            <MemberAvatar name={h.name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                <span className="truncate">{h.name}</span>
                {h.isBlocked ? <BlockedChip /> : null}
              </p>
              {h.isBlocked && h.blockReason ? <p className="truncate text-xs text-destructive">السبب: {h.blockReason}</p> : null}
              <p className="text-xs text-muted-foreground nums">
                {h.memberCode}
                {h.phone ? ` · ${toArabicDigits(h.phone)}` : ''}
              </p>
            </div>
            {branch ? (
              <span className="hidden items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground md:inline-flex">
                <Building2 className="size-3" />
                {branch}
              </span>
            ) : null}
            {h.activeSubscriptionType && (
              <span className="hidden rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary sm:inline">
                {h.activeSubscriptionType}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
