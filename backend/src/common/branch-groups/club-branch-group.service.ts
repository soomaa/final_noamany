import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ClubBranchGroupReader {
  siblingBranchIds(branchId: number): Promise<number[]>;
  sharesGroup(firstBranchId: number, secondBranchId: number): Promise<boolean>;
}

/**
 * Explicit, persisted access groups for club operations. A branch that has no
 * active group is deliberately isolated: no implicit cross-branch access.
 */
@Injectable()
export class ClubBranchGroupService implements ClubBranchGroupReader {
  constructor(private readonly prisma: PrismaService) {}

  async siblingBranchIds(branchId: number): Promise<number[]> {
    if (!Number.isInteger(branchId) || branchId <= 0) return [];

    const membership = await this.prisma.club_branch_group_members.findUnique({
      where: { branch_id: branchId },
      select: {
        group: {
          select: {
            is_active: true,
            members: { select: { branch_id: true } },
          },
        },
      },
    });

    if (!membership?.group?.is_active) return [branchId];

    const branchIds = membership.group.members
      .map((member) => member.branch_id)
      .filter((id) => Number.isInteger(id) && id > 0);
    return branchIds.length ? [...new Set(branchIds)].sort((a, b) => a - b) : [branchId];
  }

  async sharesGroup(firstBranchId: number, secondBranchId: number): Promise<boolean> {
    if (!Number.isInteger(firstBranchId) || !Number.isInteger(secondBranchId)) return false;
    if (firstBranchId === secondBranchId) return true;
    return (await this.siblingBranchIds(firstBranchId)).includes(secondBranchId);
  }

  // ─── Admin CRUD ───────────────────────────────────────────────────────────

  async listGroups() {
    const groups = await this.prisma.club_branch_groups.findMany({
      orderBy: { id: 'asc' },
      include: {
        members: {
          select: { branch_id: true },
          orderBy: { branch_id: 'asc' },
        },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      isActive: g.is_active,
      branchIds: g.members.map((m) => m.branch_id),
    }));
  }

  async createGroup(name: string, branchIds: number[]) {
    const existing = await this.prisma.club_branch_groups.findUnique({ where: { name } });
    if (existing) throw new ConflictException('يوجد مجموعة بهذا الاسم بالفعل');

    // Verify no branch already belongs to another group
    const taken = await this.prisma.club_branch_group_members.findMany({
      where: { branch_id: { in: branchIds } },
      select: { branch_id: true, group: { select: { name: true } } },
    });
    if (taken.length) {
      const names = taken.map((t) => `فرع ${t.branch_id} (ضمن ${t.group.name})`).join('، ');
      throw new ConflictException(`بعض الفروع تنتمي لمجموعة أخرى بالفعل: ${names}`);
    }

    const group = await this.prisma.club_branch_groups.create({
      data: {
        name,
        is_active: true,
        members: { create: branchIds.map((branch_id) => ({ branch_id })) },
      },
      include: { members: { select: { branch_id: true } } },
    });
    return {
      id: group.id,
      name: group.name,
      isActive: group.is_active,
      branchIds: group.members.map((m) => m.branch_id),
    };
  }

  async updateGroup(id: number, patch: { name?: string; isActive?: boolean; branchIds?: number[] }) {
    const group = await this.prisma.club_branch_groups.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    if (patch.branchIds !== undefined) {
      // Verify no branch belongs to a DIFFERENT group
      const taken = await this.prisma.club_branch_group_members.findMany({
        where: { branch_id: { in: patch.branchIds }, group_id: { not: id } },
        select: { branch_id: true, group: { select: { name: true } } },
      });
      if (taken.length) {
        const names = taken.map((t) => `فرع ${t.branch_id} (ضمن ${t.group.name})`).join('، ');
        throw new ConflictException(`بعض الفروع تنتمي لمجموعة أخرى بالفعل: ${names}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.club_branch_groups.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
        },
      });
      if (patch.branchIds !== undefined) {
        await tx.club_branch_group_members.deleteMany({ where: { group_id: id } });
        if (patch.branchIds.length) {
          await tx.club_branch_group_members.createMany({
            data: patch.branchIds.map((branch_id) => ({ group_id: id, branch_id })),
          });
        }
      }
    });
    return this.listGroups().then((gs) => gs.find((g) => g.id === id));
  }

  async deleteGroup(id: number) {
    const group = await this.prisma.club_branch_groups.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');
    await this.prisma.club_branch_groups.delete({ where: { id } });
  }
}
