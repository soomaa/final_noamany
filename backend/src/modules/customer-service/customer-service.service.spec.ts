import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CustomerServiceService } from './customer-service.service';

describe('CustomerServiceService', () => {
  const prisma = {
    $transaction: jest.fn(),
    club_customer_service_questions: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    club_customer_service_interactions: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn() },
    club_customer_service_answers: { create: jest.fn() },
    club_members: { findMany: jest.fn(), findUnique: jest.fn() },
    club_subscriptions: { findMany: jest.fn(), count: jest.fn() },
  };
  const branches = {
    isBranchAllowed: jest.fn().mockReturnValue(true),
    memberGenderFilter: jest.fn().mockReturnValue(null),
    isMemberGenderAllowed: jest.fn().mockReturnValue(true),
    resolveListFilter: jest.fn().mockReturnValue(null),
  };
  let service: CustomerServiceService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    branches.isBranchAllowed.mockReturnValue(true);
    branches.memberGenderFilter.mockReturnValue(null);
    branches.isMemberGenderAllowed.mockReturnValue(true);
    branches.resolveListFilter.mockReturnValue(null);
    prisma.club_members.findUnique.mockResolvedValue({ id: 10, branch_id: 3, gender: 'female' });
    service = new CustomerServiceService(prisma as never, branches as never);
  });

  it('applies branch, gender, membership status and date filters on the server before loading follow-ups', async () => {
    prisma.club_customer_service_interactions.findMany.mockResolvedValue([]);
    prisma.club_customer_service_interactions.count.mockResolvedValue(0);
    await service.listFollowUps({ branchId: 3, gender: 'female', membershipStatus: 'expired', dateFrom: '2026-09-01', dateTo: '2026-09-30', page: 1, pageSize: 20 }, { sub: 12 } as never);
    expect(branches.isBranchAllowed).toHaveBeenCalledWith(expect.anything(), 3);
    expect(prisma.club_customer_service_interactions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branch_id: 3,
        gender: 'female',
        membership_status: 'expired',
        contact_date: { gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-09-30T00:00:00.000Z') },
      }),
    }));
  });

  it('snapshots the active question text and version into each response', async () => {
    prisma.club_customer_service_questions.findMany.mockResolvedValue([{ id: 7, title: 'هل أنت راضٍ؟', version: 4, is_active: true }]);
    prisma.club_customer_service_interactions.create.mockResolvedValue({ id: 9 });
    await service.createInteraction({ memberId: 10, branchId: 3, answers: [{ questionId: 7, answer: 'نعم' }] }, 12);
    expect(prisma.club_customer_service_answers.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ question_id: 7, question_title: 'هل أنت راضٍ؟', question_version: 4, answer: 'نعم' }),
    }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('writes a valid Prisma Date value for a date-only contact date', async () => {
    prisma.club_customer_service_questions.findMany.mockResolvedValue([]);
    prisma.club_customer_service_interactions.create.mockResolvedValue({ id: 9 });

    await service.createInteraction({ memberId: 10, branchId: 3, opinion: 'ممتاز', contactDate: '2026-09-09' }, 12);

    expect(prisma.club_customer_service_interactions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contact_date: new Date('2026-09-09T00:00:00.000Z') }),
    }));
  });

  it('defaults a scoped employee follow-up list to their own branch', async () => {
    branches.resolveListFilter.mockReturnValue([3]);
    prisma.club_customer_service_interactions.findMany.mockResolvedValue([]);
    prisma.club_customer_service_interactions.count.mockResolvedValue(0);
    prisma.club_members.findMany.mockResolvedValue([]);
    prisma.club_subscriptions.findMany.mockResolvedValue([]);

    await service.listFollowUps({}, { sub: 12, branch: 3 } as never);

    expect(prisma.club_customer_service_interactions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: { in: [3] } }),
    }));
  });

  it('intersects a client gender filter with the authenticated employee audience', async () => {
    branches.memberGenderFilter.mockReturnValue('female');
    prisma.club_customer_service_interactions.findMany.mockResolvedValue([]);
    prisma.club_customer_service_interactions.count.mockResolvedValue(0);
    prisma.club_members.findMany.mockResolvedValue([]);
    prisma.club_subscriptions.findMany.mockResolvedValue([]);

    await service.listFollowUps({ gender: 'male' }, { sub: 12, level: 2, man_women_type: 1 } as never);

    expect(prisma.club_customer_service_interactions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ gender: 'female' }),
    }));
  });

  it('stores the member gender snapshot instead of trusting the submitted interaction gender', async () => {
    prisma.club_customer_service_questions.findMany.mockResolvedValue([]);
    prisma.club_customer_service_interactions.create.mockResolvedValue({ id: 9 });

    await service.createInteraction({ memberId: 10, branchId: 3, gender: 'male', opinion: 'ممتاز' }, 12, { sub: 12 } as never);

    expect(prisma.club_customer_service_interactions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ gender: 'female' }),
    }));
  });

  it('rejects detail access when the interaction belongs to another audience section', async () => {
    prisma.club_customer_service_interactions.findUnique.mockResolvedValue({ id: 9, branch_id: 3, gender: 'male' });
    branches.isMemberGenderAllowed.mockReturnValue(false);

    await expect(service.getInteraction(9, { sub: 12, level: 2, man_women_type: 1 } as never))
      .rejects.toThrow('لا يمكنك الوصول لهذا القسم');
  });

  it('validates every answer before creating the interaction so an invalid question cannot leave a partial call record', async () => {
    prisma.club_customer_service_questions.findMany.mockResolvedValue([{ id: 7, title: 'هل أنت راضٍ؟', version: 4, is_active: true }]);

    await expect(service.createInteraction({
      memberId: 10,
      branchId: 3,
      answers: [{ questionId: 7, answer: 'نعم' }, { questionId: 8, answer: 'لا' }],
    }, 12)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.club_customer_service_interactions.create).not.toHaveBeenCalled();
  });

  it('requires one answer for every active follow-up question', async () => {
    prisma.club_customer_service_questions.findMany.mockResolvedValue([
      { id: 7, title: 'هل أنت راضٍ؟', version: 4, is_active: true },
      { id: 8, title: 'هل تم حل المشكلة؟', version: 2, is_active: true },
    ]);

    await expect(service.createInteraction({
      memberId: 10,
      branchId: 3,
      answers: [{ questionId: 7, answer: 'نعم' }],
    }, 12)).rejects.toThrow('إجابة واحدة لكل سؤال');

    expect(prisma.club_customer_service_interactions.create).not.toHaveBeenCalled();
  });

  it('returns only opinion-bearing interactions in the opinions report', async () => {
    prisma.club_customer_service_interactions.findMany.mockResolvedValue([]);
    prisma.club_customer_service_interactions.count.mockResolvedValue(0);
    prisma.club_members.findMany.mockResolvedValue([]);
    prisma.club_subscriptions.findMany.mockResolvedValue([]);

    await service.listOpinions({ branchId: 3 }, { sub: 12 } as never);

    expect(prisma.club_customer_service_interactions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ opinion: { not: null } }),
    }));
  });

  it('replaces an edited question with a new version atomically', async () => {
    prisma.club_customer_service_questions.findFirst.mockResolvedValue({ id: 7, title: 'قديم', version: 4, branch_id: 3, is_active: true });
    prisma.club_customer_service_questions.create.mockResolvedValue({ id: 8, title: 'محدث', version: 5 });

    await expect(service.versionQuestion(7, 'محدث', 12, { sub: 12 } as never)).resolves.toMatchObject({ id: 8, version: 5 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.club_customer_service_questions.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { is_active: false } });
  });

  it('forbids a branch-scoped employee from creating a global follow-up question', async () => {
    branches.resolveListFilter.mockReturnValue([3]);

    await expect(service.createQuestion(
      { title: 'هل تم حل المشكلة؟' },
      12,
      { sub: 12, branch: 3 } as never,
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.club_customer_service_questions.create).not.toHaveBeenCalled();
  });

  it('forbids a branch-scoped employee from versioning a global follow-up question', async () => {
    branches.resolveListFilter.mockReturnValue([3]);
    prisma.club_customer_service_questions.findFirst.mockResolvedValue({
      id: 7,
      title: 'قديم',
      version: 4,
      branch_id: null,
      is_active: true,
    });

    await expect(service.versionQuestion(7, 'محدث', 12, { sub: 12, branch: 3 } as never))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.club_customer_service_questions.update).not.toHaveBeenCalled();
  });

  describe('listCustomers', () => {
    it('lists members with a currently ongoing subscription, not merely logged calls', async () => {
      prisma.club_subscriptions.findMany.mockResolvedValue([
        {
          id: 1, subscription_number: 'S-1', subscription_type: 'شهري',
          subscription_start_date: '2026-08-01', subscription_end_date: '2026-09-30', status: 'active', branch_id: 3,
          member: { id: 10, name: 'أحمد', member_code: 'M-10', phone: '0100', gender: 'male' },
        },
      ]);
      prisma.club_subscriptions.count.mockResolvedValue(1);

      const result = await service.listCustomers({ branchId: 3, status: 'ongoing' }, { sub: 12 } as never);

      expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          branch_id: 3,
          member_id: { not: null },
          subscription_end_date: expect.objectContaining({ gte: expect.any(String) }),
        }),
      }));
      expect(result.data).toEqual([expect.objectContaining({ memberId: 10, memberName: 'أحمد', memberPhone: '0100', subscriptionNumber: 'S-1' })]);
      expect(result.total).toBe(1);
    });

    it('excludes today and later for the expired filter', async () => {
      prisma.club_subscriptions.findMany.mockResolvedValue([]);
      prisma.club_subscriptions.count.mockResolvedValue(0);

      await service.listCustomers({ status: 'expired', dateFrom: '2026-08-01', dateTo: '2026-08-31' }, { sub: 12 } as never);

      expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          subscription_end_date: { gte: '2026-08-01', lt: expect.any(String), lte: '2026-08-31' },
        }),
      }));
    });

    it('locks a restricted employee to their own gender regardless of the requested query', async () => {
      branches.memberGenderFilter.mockReturnValue('female');
      prisma.club_subscriptions.findMany.mockResolvedValue([]);
      prisma.club_subscriptions.count.mockResolvedValue(0);

      await service.listCustomers({ status: 'ongoing', gender: 'male' }, { sub: 12, man_women_type: 2 } as never);

      expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ member: { is_deleted: false, gender: 'female' } }),
      }));
    });

    it('rejects an inverted date range', async () => {
      await expect(
        service.listCustomers({ status: 'ongoing', dateFrom: '2026-09-30', dateTo: '2026-09-01' }, { sub: 12 } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
