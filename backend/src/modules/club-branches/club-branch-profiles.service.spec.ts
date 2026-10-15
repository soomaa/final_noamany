import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubBranchProfilesService, normaliseWorkingHours, parseGallery } from './club-branch-profiles.service';

describe('ClubBranchProfilesService', () => {
  const prisma = {
    tbl_branches: { findMany: jest.fn(), findUnique: jest.fn() },
    club_branch_profiles: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue('/uploads') };
  const scope = new BranchScopeService({ get: jest.fn().mockReturnValue({}) } as never);
  const service = new ClubBranchProfilesService(prisma as never, config as never, scope);
  const admin = { sub: 1, level: 1 } as never;
  const branch2Staff = { sub: 2, level: 3, branch: 2, branchIds: [2] } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tbl_branches.findMany.mockResolvedValue([
      { branch_id: 1, branch_name: 'الفرع الرئيسي' },
      { branch_id: 2, branch_name: 'فرع ب' },
    ]);
    prisma.tbl_branches.findUnique.mockImplementation(async ({ where }: { where: { branch_id: number } }) =>
      [1, 2].includes(where.branch_id) ? { branch_id: where.branch_id, branch_name: `فرع ${where.branch_id}` } : null);
    prisma.club_branch_profiles.findMany.mockResolvedValue([
      {
        branch_id: 2, display_name: 'ONE80 التجمع', display_name_en: null, is_published: false, sort_order: 0,
        cover_image: 'public-file:cover', gallery: ['public-file:g1', '', 7], working_hours: null,
      },
    ]);
    prisma.club_branch_profiles.findUnique.mockResolvedValue(null);
  });

  it('normalises any stored working hours into exactly seven days', () => {
    const week = normaliseWorkingHours([
      { weekday: 1, closed: false, opensAt: '09:00', closesAt: '23:00' },
      { weekday: 2, closed: false, opensAt: '09:00', closesAt: 'bad' },
      { weekday: 9, closed: false, opensAt: '09:00', closesAt: '10:00' },
    ]);
    expect(week).toHaveLength(7);
    expect(week[1]).toEqual({ weekday: 1, closed: false, opensAt: '09:00', closesAt: '23:00' });
    expect(week[2]).toEqual({ weekday: 2, closed: true, opensAt: null, closesAt: null });
    expect(normaliseWorkingHours('garbage').every((day) => day.closed)).toBe(true);
    expect(parseGallery(['a', ' ', 3, 'b'])).toEqual(['a', 'b']);
  });

  it('lists every branch for an admin, with public names and URL twins of the photos', async () => {
    const rows = await service.listForStaff(admin);
    expect(rows.map((row) => row.branchId)).toEqual([1, 2]);
    expect(rows[1]).toMatchObject({
      publicName: 'ONE80 التجمع',
      publicNameEn: 'ONE80 التجمع',
      coverImage: 'public-file:cover',
      coverImageUrl: '/api/uploads/public/cover',
      gallery: ['public-file:g1'],
      galleryUrls: ['/api/uploads/public/g1'],
      hasProfile: true,
    });
    expect(rows[0]).toMatchObject({ publicName: 'الفرع الرئيسي', publicNameEn: 'الفرع الرئيسي', hasProfile: false });
  });

  it('scopes the admin list to the staff member branches', async () => {
    await service.listForStaff(branch2Staff);
    expect(prisma.tbl_branches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: { in: [2] } }),
    }));
  });

  it('hides unpublished branches from members and guests', async () => {
    const rows = await service.listPublic();
    expect(rows.map((row) => row.branchId)).toEqual([1]);
    prisma.club_branch_profiles.findUnique.mockResolvedValueOnce({ branch_id: 2, is_published: false });
    await expect(service.findPublic(2)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses edits outside the staff member scope', async () => {
    await expect(service.upsert(branch2Staff, 1, { displayName: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_branch_profiles.upsert).not.toHaveBeenCalled();
  });

  it('upserts only the posted fields and refuses private image references', async () => {
    await service.upsert(admin, 2, { displayName: '  ONE80  ', gallery: ['public-file:a'], sortOrder: '3' });
    expect(prisma.club_branch_profiles.upsert).toHaveBeenCalledWith({
      where: { branch_id: 2 },
      create: { branch_id: 2, display_name: 'ONE80', gallery: ['public-file:a'], sort_order: 3 },
      update: { display_name: 'ONE80', gallery: ['public-file:a'], sort_order: 3 },
    });
    await expect(service.upsert(admin, 2, { coverImage: 'file:secret' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert(admin, 2, { tagline: 'x'.repeat(161) })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert(admin, 99, {})).rejects.toBeInstanceOf(NotFoundException);
  });
});
