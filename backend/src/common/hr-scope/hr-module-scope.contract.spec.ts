import { ActivitiesService } from '../../modules/activities/activities.service';
import { EvaluationsService } from '../../modules/evaluations/evaluations.service';
import { PenaltiesService } from '../../modules/penalties/penalties.service';
import { RewardsService } from '../../modules/rewards/rewards.service';
import { SiteVisitsService } from '../../modules/site-visits/site-visits.service';

const actor = { sub: 9, level: 3 } as never;

describe('employee-owned HR modules enforce resolved data scope', () => {
  const scope = {
    employeeIdentities: jest.fn().mockResolvedValue({ ids: [7], codes: [700] }),
    assertEmployeeInScope: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  it('filters penalties by visible employee ids', async () => {
    const prisma = {
      hr_gezaat: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    await new PenaltiesService(prisma as never, scope as never).list({ skip: 0, take: 20, page: 1, pageSize: 20 } as never, actor);
    expect(prisma.hr_gezaat.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ emp_id: { in: [7] } }] },
    }));
  });

  it('filters rewards by both canonical ids and legacy employee codes', async () => {
    const prisma = {
      hr_mokafat_details: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      hr_mokafat: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new RewardsService(prisma as never, scope as never).list({ skip: 0, take: 20, page: 1, pageSize: 20 } as never, actor);
    expect(prisma.hr_mokafat_details.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ emp_code: { in: [7, 700] } }] },
    }));
  });

  it('authorizes an activity owner before returning activity details', async () => {
    const prisma = {
      hr_ansheta: { findUnique: jest.fn().mockResolvedValue({ id: 3, emp_id: 7 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({ employee: 'Scoped' }) },
      hr_ansheta_files: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new ActivitiesService(prisma as never, scope as never).get(3, actor);
    expect(scope.assertEmployeeInScope).toHaveBeenCalledWith(actor, 7, 'affairs.activities');
  });

  it('filters string-backed evaluation employee ids', async () => {
    const prisma = {
      hr_ta3en_moaqt_evaluation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    await new EvaluationsService(prisma as never, scope as never).list({ skip: 0, take: 20, page: 1, pageSize: 20 } as never, actor);
    expect(prisma.hr_ta3en_moaqt_evaluation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ emp_id_fk: { in: ['7'] } }] },
    }));
  });

  it('filters site visit records without hiding the shared site directory', async () => {
    const prisma = {
      tbl_sites: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      tbl_mohmat_3mal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new SiteVisitsService(prisma as never, scope as never).listRecords(2, actor);
    expect(prisma.tbl_mohmat_3mal.findMany).toHaveBeenCalledWith({
      where: { site_id: 2, emp_id_fk: { in: [7] } },
      orderBy: { id: 'desc' },
    });
  });
});
