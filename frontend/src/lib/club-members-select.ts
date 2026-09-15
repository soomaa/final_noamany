import type { PaginatedResponse } from '@/components/common/data-table';
import { api } from '@/lib/api';
import type { ClubMemberListItem } from '@/types/club';

/** Load every member visible in pickers (branch-scoped, not limited to sales-rep ownership). */
export async function fetchClubMembersForSelect(
  status: 'active' | 'inactive' | 'all' = 'active',
): Promise<ClubMemberListItem[]> {
  const all: ClubMemberListItem[] = [];
  let page = 1;
  let total = 0;

  do {
    const { data: list } = await api.get<PaginatedResponse<ClubMemberListItem>>('/club-members/select-options', {
      params: { pageSize: 200, page, status },
    });
    all.push(...(list.data ?? []));
    total = list.total ?? all.length;
    page += 1;
  } while (all.length < total && page <= 100);

  return all;
}
