import { Prisma } from '@prisma/client';
import { normalizePhone } from './club-sales.constants';

type LeadIdentity = {
  id: number;
  branch_id: number;
  phone: string;
  converted_member_id: number | null;
};

export type LeadSubscriptionContext = {
  subscriptionNumber: string;
  packageName: string | null;
  paidAmount: number;
  startDate: string;
  endDate: string;
};

function phoneKey(value: string) {
  const digits = normalizePhone(value).replace(/\D/g, '').replace(/^00/, '');
  return /^201\d{9}$/.test(digits) ? `0${digits.slice(2)}` : digits;
}

function phoneVariants(value: string) {
  const local = phoneKey(value);
  return [
    ...new Set([
      value,
      normalizePhone(value),
      local,
      ...(/^01\d{9}$/.test(local)
        ? [`20${local.slice(1)}`, `+20${local.slice(1)}`, `0020${local.slice(1)}`]
        : []),
    ]),
  ];
}

/** Resolve real subscription money in one branch-scoped query; never infer it from lead notes. */
export async function leadSubscriptionContexts(
  db: Pick<Prisma.TransactionClient, 'club_subscriptions'>,
  leads: LeadIdentity[],
) {
  const result = new Map<number, LeadSubscriptionContext>();
  const eligible = leads.filter(
    (lead) => lead.converted_member_id != null || phoneKey(lead.phone).length >= 7,
  );
  if (!eligible.length) return result;

  const rows = await db.club_subscriptions.findMany({
    where: {
      OR: eligible.map((lead) => ({
        branch_id: lead.branch_id,
        ...(lead.converted_member_id != null
          ? {
              member_id: lead.converted_member_id,
              member: { is_deleted: false, branch_id: lead.branch_id },
            }
          : {
              OR: [
                {
                  member: {
                    phone: { in: phoneVariants(lead.phone) },
                    is_deleted: false,
                    branch_id: lead.branch_id,
                  },
                },
                { member_id: null, guardian_phone: { in: phoneVariants(lead.phone) } },
              ],
            }),
      })),
    },
    select: {
      id: true,
      member_id: true,
      branch_id: true,
      guardian_phone: true,
      member: { select: { phone: true } },
      subscription_number: true,
      subscription_type: true,
      paid_amount: true,
      subscription_start_date: true,
      subscription_end_date: true,
    },
    orderBy: [{ subscription_end_date: 'desc' }, { id: 'desc' }],
  });

  for (const lead of eligible) {
    const matches = rows.filter(
      (row) =>
        row.branch_id === lead.branch_id &&
        (lead.converted_member_id != null
          ? row.member_id === lead.converted_member_id
          : phoneKey(row.member?.phone ?? row.guardian_phone ?? '') === phoneKey(lead.phone)),
    );
    if (
      lead.converted_member_id == null &&
      new Set(matches.map((row) => row.member_id ?? `legacy:${row.subscription_number}`)).size > 1
    ) {
      continue;
    }
    const row = matches[0];
    if (row) {
      result.set(lead.id, {
        subscriptionNumber: row.subscription_number,
        packageName: row.subscription_type,
        paidAmount: Number(row.paid_amount),
        startDate: row.subscription_start_date,
        endDate: row.subscription_end_date,
      });
    }
  }
  return result;
}
