import { api } from '@/lib/api';
import type { ClubMemberLookupItem } from '@/types/club';

export const MEMBER_SEARCH_MIN_CHARS = 2;
export const MEMBER_SEARCH_MAX_RESULTS = 20;

export interface ClubSearchResult {
  hits: ClubMemberLookupItem[];
  topMatch: ClubMemberLookupItem | null;
}

/** Search members by code, name, or phone within the selected operation branch group. */
export async function searchClubMembers(q: string, branchId?: number, exactBranch = false, forMembershipOperation = false, forRefundTransfer = false, forMeasurementOperation = false): Promise<ClubSearchResult> {
  const trimmed = q.trim();
  if (trimmed.length < MEMBER_SEARCH_MIN_CHARS) {
    return { hits: [], topMatch: null };
  }

  const { data } = await api.get<ClubMemberLookupItem[]>(forMeasurementOperation ? '/club-members/measurement-operation-lookup' : forRefundTransfer ? '/club-members/refund-transfer-lookup' : forMembershipOperation ? '/club-members/membership-operation-lookup' : '/club-members/lookup', {
    params: { q: trimmed, ...(branchId && branchId > 0 ? { branch: branchId, ...(exactBranch ? { exactBranch: true } : {}) } : {}) },
  });
  const hits = data.slice(0, MEMBER_SEARCH_MAX_RESULTS);
  return { hits, topMatch: hits[0] ?? null };
}
