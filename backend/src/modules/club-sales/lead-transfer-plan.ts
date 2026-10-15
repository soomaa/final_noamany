export function buildLeadTransferPlan(input: {
  leads: Array<{ status: string }>;
  subscriptions: Array<{ endDate: string }>;
  today: string;
}) {
  const leads = input.leads.filter((lead) => lead.status !== 'lost').length;
  const activeSubscriptions = input.subscriptions.filter((row) => row.endDate >= input.today).length;
  return { leads, activeSubscriptions, total: leads + activeSubscriptions };
}

export function canAssignSalesRepToBranch(
  rep: { isActive?: boolean; branchIds?: number[]; branchId?: number | null },
  branchId: number,
) {
  if (rep.isActive === false) return false;
  if (rep.branchIds?.length) return rep.branchIds.includes(Number(branchId));
  return rep.branchId == null || rep.branchId === Number(branchId);
}
