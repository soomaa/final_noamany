export interface SalesLead {
  profilePicture?: string | null;
  subscription?: {
    subscriptionNumber: string;
    packageName: string | null;
    paidAmount: number;
    startDate: string;
    endDate: string;
  } | null;
  id: number;
  convertedMemberId?: number | null;
  branchId?: number;
  fullName: string;
  phone: string;
  status: string;
  statusLabel?: string;
  sourceLabel?: string;
  source?: string | null;
  lastContactedAt?: string | null;
  createdAt?: string;
  nextCallAt?: string | null;
  nextFollowUpAt?: string | null;
  branchName?: string | null;
  memberCode?: string | null;
}

export interface PortalSummary {
  specialist: { employeeId: number; name: string | null; branchId: number };
  statistics: {
    totalAssigned: number;
    registeredToday: number;
    registeredThisMonth: number;
    activeMembers: number;
  };
  performance: {
    periodStart: string;
    periodEnd: string;
    target: number;
    actualRevenue: number;
    achievementPct: number;
    commissionPercent: number;
    commissionDue: number;
    assignedLeads: number;
    overdueLeads: number;
    convertedLeads: number;
    conversionRate: number;
    averageResponseHours: number | null;
    closedDeals: number;
  };
  pipeline: {
    new: number;
    inProgress: number;
    followLater: number;
    qualified: number;
    converted: number;
    lost: number;
  };
  leaderboard: Array<{ employeeId: number; name: string; achievementPct: number; rank: number; isCurrent: boolean }>;
  closedDeals: Array<{
    id: number;
    subscriptionNumber: string;
    customerName: string | null;
    paidAmount: number;
    registrationDate: string;
    subscriptionType: string | null;
  }>;
  recentMembers: Array<{
    id: number;
    memberCode: string;
    name: string;
    phone: string | null;
    isActive: boolean;
    createdAt: string;
  }>;
}

export interface SalesRenewalRow {
  memberId: number;
  memberCode: string;
  memberName: string;
  phone: string | null;
  subscriptionId: number;
  paidAmount: number;
  subscriptionType: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  leadId: number | null;
  lastContactedAt: string | null;
}
