import { PrismaService } from '../../common/prisma/prisma.service';

export type MemberBrief = {
  name: string;
  member_code: string;
  phone: string | null;
  gender: string;
  profile_picture: string | null;
};

export async function loadMemberBriefMap(
  prisma: PrismaService,
  memberIds: (number | null | undefined)[],
): Promise<Map<number, MemberBrief>> {
  const ids = [...new Set(memberIds.filter((id): id is number => id != null && id > 0))];
  if (ids.length === 0) return new Map();
  const members = await prisma.club_members.findMany({
    where: { id: { in: ids }, is_deleted: false },
    select: { id: true, name: true, member_code: true, phone: true, gender: true, profile_picture: true },
  });
  return new Map(
    members.map((m) => [
      m.id,
      {
        name: m.name,
        member_code: m.member_code,
        phone: m.phone,
        gender: m.gender,
        profile_picture: m.profile_picture,
      },
    ]),
  );
}

export function attachMemberBrief(memberId: number | null | undefined, map: Map<number, MemberBrief>) {
  if (memberId == null) {
    return {
      memberName: null as string | null,
      memberCode: null as string | null,
      memberPhone: null as string | null,
      memberGender: null as string | null,
      memberProfilePicture: null as string | null,
    };
  }
  const m = map.get(memberId);
  return {
    memberName: m?.name ?? null,
    memberCode: m?.member_code ?? null,
    memberPhone: m?.phone ?? null,
    memberGender: m?.gender ?? null,
    memberProfilePicture: m?.profile_picture ?? null,
  };
}

export async function searchMemberIds(prisma: PrismaService, search: string): Promise<number[]> {
  const s = search.trim();
  if (!s) return [];
  const members = await prisma.club_members.findMany({
    where: {
      is_deleted: false,
      OR: [
        { name: { contains: s } },
        { member_code: { contains: s } },
        { phone: { contains: s } },
        { card_number: { contains: s } },
      ],
    },
    select: { id: true },
    take: 200,
  });
  return members.map((m) => m.id);
}
