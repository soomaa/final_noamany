export interface ClubMemberListItem {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  gender: 'male' | 'female';
  cardNumber: string | null;
  dateOfBirth: string | null;
  address: string | null;
  maritalStatus: string | null;
  jobTitle: string | null;
  profilePicture: string | null;
  branchId: number;
  membershipTypeId: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
  isBlocked?: boolean;
  blockReason?: string | null;
  blockedAt?: string | null;
  blockedBy?: number | null;
  salesId?: number | null;
  employeeId?: number | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastCheckIn?: string | null;
  membershipType?: {
    id: number;
    name: string;
    price: number;
    durationDays: number;
  } | null;
}

/** Minimal payload used by member name/code search fields. */
export interface ClubMemberLookupItem {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  gender: 'male' | 'female';
  branchId: number;
}

export interface ClubMemberStatistics {
  total: number;
  memberActive: number;
  memberInactive: number;
  active: number;
  inactive: number;
}

export interface ClubMemberOverviewSubscription {
  id: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  subscriptionTypeName: string | null;
  branchId: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'upcoming' | 'frozen';
  isLinkedToSessions: boolean;
  sessionsCount: number | null;
  sessionsUsed: number | null;
  isLinkedToSpa: boolean;
  spaCount: number | null;
  spaUsed: number;
  inbodyCount: number | null;
  inbodyUsed: number;
  daysRemaining: number | null;
  daysOverdue: number | null;
  daysUntilStart: number | null;
  paidAmount: number;
  remainingAmount: number;
  activeFreeze: {
    startDate: string;
    plannedEndDate: string | null;
    plannedDays: number;
    actualDays: number | null;
    reason: string | null;
  } | null;
}

export interface ClubMemberOverviewLocker {
  id: number;
  subscriptionNumber: string;
  branchId: number;
  lockerNumber: string | null;
  subscriptionTypeName: string | null;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'upcoming' | 'frozen';
  paidAmount: number;
  remainingAmount: number;
}

export interface ClubMemberOverviewFreeze {
  subscriptionId: number;
  subscriptionNumber: string | null;
  subscriptionType: string | null;
  startDate: string;
  endDate: string | null;
  plannedDays: number;
  actualDays: number | null;
  isActive: boolean;
  reason: string | null;
}

export interface ClubMemberOverview {
  member: ClubMemberListItem & {
    isBlocked: boolean;
    blockReason: string | null;
    lastCheckIn: string | null;
  };
  subscriptionCount: number;
  lockerSubscriptionCount: number;
  suspendedDays: number;
  frozenCount: number;
  subscriptions: ClubMemberOverviewSubscription[];
  lockerSubscriptions: ClubMemberOverviewLocker[];
  freezes: ClubMemberOverviewFreeze[];
  points?: {
    memberId: number; memberCode: string | null; points: number; value: number;
    history: Array<{ id: number; type: string; points: number; value: number | null; action: string | null; occurredOn: string | null; expiresOn: string | null; subscriptionId: number | null }>;
  } | null;
  recentReceipts?: Array<{ id: number; receiptNumber: string; date: string; amount: number; status: string; description: string | null }>;
  recentAttendance?: Array<{ id: number; checkIn: string; checkOut: string | null; subscriptionType: string | null; type: string; notes: string | null }>;
}

export interface ClubMembershipType {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  isActive: boolean;
}

export interface ClubMemberFormData {
  branchId: number;
  name: string;
  phone: string;
  gender: 'male' | 'female';
  cardNumber: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  maritalStatus?: string;
  jobTitle?: string;
  profilePicture?: string;
  membershipTypeId?: number;
  startDate?: string;
  endDate?: string;
  notes?: string;
  isActive?: boolean;
  salesId?: number;
  employeeId?: number;
  guardianName?: string;
  guardianPhone?: string;
  autoCreateUser?: boolean;
}

export interface ClubMemberCreateResponse {
  member: ClubMemberListItem;
  generatedCredentials: { username: string; password: string } | null;
}

export interface ClubMemberAttachment {
  id: number;
  type: string;
  label: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: string;
  uploadedBy: number | null;
  downloadUrl: string;
}

export interface ClubMemberWorkspaceSubscription {
  id: number;
  memberId: number | null;
  subscriptionNumber: string;
  subscriptionType: string | null;
  registrationDate: string;
  startDate: string;
  endDate: string;
  subscriptionValue: number;
  paidAmount: number;
  remainingAmount: number;
  discountValue: number;
  status: 'active' | 'expired' | 'upcoming' | 'frozen';
  isLinkedToSessions: boolean;
  sessionsCount: number | null;
  sessionsUsed: number | null;
}

export interface ClubMemberWorkspaceLockerSubscription {
  id: number;
  memberId: number | null;
  subscriptionNumber: string;
  startDate: string;
  endDate: string;
  paidAmount: number;
  status: 'active' | 'expired' | 'upcoming';
  lockerNumber: string | null;
  subscriptionType: string | null;
}

export interface ClubMemberWorkspace {
  member: ClubMemberListItem;
  summary: {
    subscriptionCount: number;
    totalPaid: number;
    totalRemaining: number;
    pointsBalance: number;
  };
  subscriptions: ClubMemberWorkspaceSubscription[];
  lockerSubscriptions: ClubMemberWorkspaceLockerSubscription[];
}

export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  duplicates: Array<{
    field: string;
    fieldLabel: string;
    memberId: number;
    memberCode: string;
    name: string;
    phone: string | null;
    cardNumber: string | null;
  }>;
  message: string | null;
}

export interface ClubSubscriptionListItem {
  id: number;
  subscriptionNumber: string;
  registrationDate: string;
  branchId: number;
  branchName?: string | null;
  memberId: number | null;
  memberCode?: string | null;
  memberPhone?: string | null;
  customerName: string | null;
  subscriptionTypeId?: number | null;
  specialClassTypeId?: number | null;
  privatePackageId?: number | null;
  privateTrainerId?: number | null;
  subscriptionType: string | null;
  subscriptionTypeName?: string | null;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  subscriptionValue: number;
  discountEnabled: boolean;
  discountCodeId?: number | null;
  discountPercentage?: number | null;
  discountValue: number;
  /** Points consumed to create this subscription; points are never editable afterwards. */
  pointsRedeemed?: number;
  paidAmount: number;
  transferredCreditAmount?: number;
  settledAmount?: number;
  waivedAmount?: number;
  remainingAmount: number;
  paymentMethod: string | null;
  receiptNumber: string | null;
  customerSourceId: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  gender: 'male' | 'female' | null;
  status: 'active' | 'expired' | 'upcoming' | 'frozen';
  isSpecial: boolean;
  isTimeBased?: boolean;
  timeFrom?: string | null;
  timeTo?: string | null;
  isLinkedToSessions?: boolean;
  sessionsCount?: number | null;
  sessionsUsed?: number | null;
  allowMultipleDailyEntries?: boolean;
  employeeId?: number | null;
  assignedStaffName?: string | null;
  salesId?: number | null;
  salesName?: string | null;
  createdByUserId?: number | null;
  createdByName?: string | null;
  activeFreeze?: {
    id: number;
    startDate: string;
    plannedEndDate: string | null;
    plannedDays: number;
    actualDays: number | null;
    reason: string | null;
    createdByUserId: number | null;
    createdByName: string | null;
    createdAt: string;
  } | null;
}

export interface ClubSubscriptionStatistics {
  total: number;
  active: number;
  expired: number;
  upcoming: number;
  totalValue: number;
  totalPaid: number;
  totalRemaining: number;
  monthlyCount: number;
  yearlyCount: number;
}

export interface ClubPrivatePackage {
  id: number;
  kind: 'subscription' | 'sessions';
  name: string;
  price: number;
  durationDays: number;
  sessionsCount: number | null;
  branchIds: number[];
  isActive: boolean;
  legacySubscriptionTypeId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClubPrivateEnrollment {
  id: number;
  subscriptionNumber: string;
  memberId: number | null;
  memberCode: string | null;
  memberName: string | null;
  trainerId: number | null;
  trainerName: string | null;
  packageId: number | null;
  packageKind: 'subscription' | 'sessions';
  subscriptionType: string | null;
  registrationDate: string;
  startDate: string;
  endDate: string;
  sessionsCount: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  subscriptionValue: number;
  discountType: string | null;
  discountValue: number;
  paidAmount: number;
  remainingAmount: number;
  receiptNumber: string | null;
  gender: 'male' | 'female' | null;
  paymentMethod: string | null;
  paymentMethods?: string[];
  branchId: number;
  createdByUserId: number | null;
  createdByName: string | null;
  status: 'active' | 'expired' | 'upcoming' | 'frozen';
  createdAt: string;
}

export interface ClubSubscriptionType {
  id: number;
  name: string;
  branchId?: number | null;
  applyToAllBranches?: boolean;
  branchIds?: number[];
  price: number;
  days: number;
  isPartOfTarget?: boolean;
  invitationsCount?: number | null;
  inbodyCount?: number | null;
  isSpecialOffer?: boolean;
  isForStudents?: boolean;
  showInApp?: boolean;
  notifyCustomers?: boolean;
  notifyOnExpiry?: boolean;
  walletPoints?: number | null;
  offerValidity?: string | null;
  isLinkedToSessions?: boolean;
  sessionsCount?: number | null;
  /** Per-count prices for session packages; empty/legacy → proportional fallback. */
  sessionPrices?: Array<{ sessionsCount: number; price: number }>;
  allowMultipleDailyEntries?: boolean;
  isLinkedToFreeze?: boolean;
  freezeDays?: number | null; // max freeze times allowed on the package
  includesSpa?: boolean;
  spaCount?: number | null;
  isActive?: boolean;
  classTypeIds?: number[];
  classTypes?: Array<{ id: number; name: string; color: string }>;
}

export interface ClubDiscountCode {
  id: number;
  code: string;
  percentage: number;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClubLockerListItem {
  id: number;
  subscriptionNumber: string;
  mainBranchId: number;
  subscriptionTypeId: number;
  customerName: string;
  memberId: number | null;
  memberName?: string | null;
  memberCode?: string | null;
  memberProfilePicture?: string | null;
  subscriptionTypeName?: string | null;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  subscriptionValue: number;
  discountEnabled: boolean;
  discountCodeId?: number | null;
  discountPercentage?: number | null;
  discountValue: number;
  paidAmount: number;
  gender: 'male' | 'female' | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
  recommendedEmployeeId: number | null;
  recommendedEmployeeName: string | null;
  bookedByName: string | null;
  remainingAmount: number;
  lockerId: number;
  lockerNumber?: string | null;
  status: 'active' | 'expired' | 'upcoming';
}

export interface ClubLockerStatistics {
  total: number;
  available: number;
  unavailable: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
}

export interface ClubLockerSubscriptionDetail {
  id: number;
  subscriptionNumber: string;
  customerName: string;
  memberId: number | null;
  memberCode: string | null;
  memberName: string | null;
  memberPhone: string | null;
  subscriptionTypeName: string | null;
  subscriptionDays: number | null;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  subscriptionValue: number;
  discountEnabled?: boolean;
  discountCodeId?: number | null;
  discountPercentage?: number | null;
  discountValue?: number;
  paidAmount: number;
  remainingAmount?: number;
  status: 'active' | 'expired' | 'upcoming';
  bookedByName: string | null;
  recommendedEmployeeName: string | null;
  receiptNumber: string | null;
  paymentMethod: string | null;
  createdAt: string;
}

export interface ClubLockerDetails {
  id: number;
  lockerNumber: string;
  mainBranchId: number;
  subBranchId: number;
  isAvailable: boolean;
  totalBookings: number;
  currentSubscription: ClubLockerSubscriptionDetail | null;
  lastBooking: ClubLockerSubscriptionDetail | null;
  history: ClubLockerSubscriptionDetail[];
}

export interface ClubDashboardSummary {
  totalMembers: { total: number; active: number; inactive: number; newThisMonth: number };
  monthlyRevenue: number;
  totalPaid: number;
  totalRemaining: number;
  subscriptionRevenue: number;
  lockerRevenue: number;
  spaRevenue?: number;
  inbodyRevenue?: number;
  classRevenue?: number;
  otherRevenue?: number;
  totalRevenueAllSources: number;
  subscriptionRefunds?: number;
  netRevenueAfterRefunds?: number;
  expenses?: number;
  expenseBreakdown: Array<{ name: string; value: number }>;
  netProfit: number;
  expensesAvailable: boolean;
  trainers: number;
  classesToday?: number;
  facilities: number;
  avgMonthlyMembership: number;
  attendanceRate: number;
  subscriptionDistribution: { monthly: number; quarterly: number; halfYearly: number; yearly: number };
  alerts: { expiredSubscriptions: number; pendingRenewals: number; newMembers: number };
  recentActivities: {
    members: Array<{ type: string; label: string; code: string; date: string }>;
    payments: Array<{ type: string; label: string; amount: number; date: string; receiptNumber: string }>;
  };
}

export interface ExecutiveDashboardSummary extends ClubDashboardSummary {
  financials: {
    paid: number;
    remaining: number;
    revenue: number;
    expenses: number;
    profit: number;
    margin: number;
    source: 'member-management';
    expenseSource: 'general-ledger';
  };
  operations: {
    activeSubscriptions: number;
    newSubscriptions: number;
    checkinsToday: number;
    checkinsInRange: number;
    uniqueVisitors: number;
    outstandingAmount: number;
    outstandingCount: number;
    expiring7: number;
    expiring30: number;
    lowStock: number;
    employees: number;
    trainers: number;
    classesToday: number;
    facilities: number;
    quickSalesToday: number;
    quickSalesAmountToday: number;
    bookingsToday: number;
  };
  trends: Array<{
    date: string;
    label: string;
    revenue: number;
    expenses: number;
    profit: number;
    newMembers: number;
    newSubscriptions: number;
    checkins: number;
  }>;
  revenueBreakdown: Array<{ name: string; value: number }>;
  expenseBreakdown: Array<{ name: string; value: number }>;
  packagePerformance: Array<{ name: string; count: number; revenue: number }>;
  membershipStatus: Array<{ name: string; value: number }>;
  branchBreakdown: Array<{
    branchId: number;
    branchName: string;
    totalRevenue: number;
    subscriptionRevenue: number;
    barRevenue: number;
    productRevenue: number;
    expenses: number;
    subscriptionsCount: number;
    newMembers: number;
    inbodyCount: number;
    inbodyRevenue: number;
    blockedMembers: number;
  }>;
  period: { start: string; end: string; days: number };
  branchId: number | null;
}
