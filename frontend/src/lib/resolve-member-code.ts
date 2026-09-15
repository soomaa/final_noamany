import { api } from '@/lib/api';
import type { ClubMemberListItem } from '@/types/club';

/** Resolve a member id from member code or national ID string. */
export async function resolveMemberIdByCode(code: string): Promise<number | null> {
  const q = code.trim();
  if (!q) return null;
  const { data: list } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
    params: { search: q, pageSize: 5 },
  });
  const exact = list.data.find((m) => m.memberCode === q || m.cardNumber === q);
  return exact?.id ?? null;
}
