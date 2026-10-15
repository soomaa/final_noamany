import { PrismaService } from '../../common/prisma/prisma.service';

function salesSchemaDelegates(prisma: PrismaService) {
  return {
    leads: prisma.club_sales_crm_leads,
    followUps: prisma.club_sales_crm_lead_follow_ups,
    salesSettings: prisma.club_sales_rep_settings,
    salesTiers: prisma.club_sales_commission_tiers,
    trainerSettings: prisma.club_trainer_commission_settings,
    trainerTiers: prisma.club_trainer_commission_tiers,
    roundRobin: prisma.club_sales_round_robin_state,
    settlements: prisma.club_target_settlements,
  };
}

describe('club sales Prisma schema contract', () => {
  it('exposes every delegate required by the CRM and target services', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 1 });
    const findMany = jest.fn().mockResolvedValue([]);
    const delegates = salesSchemaDelegates({
      club_sales_crm_leads: { upsert, findMany },
      club_sales_crm_lead_follow_ups: { findMany },
      club_sales_rep_settings: { upsert },
      club_sales_commission_tiers: { findMany },
      club_trainer_commission_settings: { upsert },
      club_trainer_commission_tiers: { findMany },
      club_sales_round_robin_state: { upsert },
      club_target_settlements: { findMany },
    } as unknown as PrismaService);

    await delegates.leads.upsert({} as never);
    await delegates.settlements.findMany({} as never);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
