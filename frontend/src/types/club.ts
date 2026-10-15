export interface ClubMemberListItem {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  gender: 'male' | 'female';
  cardNumber: string | null;
  scannerCode: string | null;
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

export interface ClubMemberStatistics {
  total: number;
  active: number;
  inactive: number;
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
  scannerCode: string;
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
  memberId: number | null;
  memberCode?: string | null;
  memberPhone?: string | null;
  customerName: string | null;
  subscriptionTypeId?: number | null;
  specialClassTypeId?: number | null;
  privatePackageId?: number | null;
  privateTrainerId?: number | null;
  renewedFromSubscriptionId?: number | null;
  renewalSuccessorId?: number | null;
  subscriptionType: string | null;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  projectedSubscriptionEndDate?: string | null;
  subscriptionValue: number;
  discountEnabled: boolean;
  discountCodeId?: number | null;
  discountPercentage?: number | null;
  discountValue: number;
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
  /** Free-text member-visible note on the subscription. */
  notes?: string | null;
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
  /** Per-count prices for a private session package; empty for duration packages. */
  sessionPrices?: Array<{ sessionsCount: number; price: number }>;
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
  sourceSubscriptionTypeId?: number | null;
  name: string;
  branchId?: number | null;
  applyToAllBranches?: boolean;
  branchIds?: number[];
  price: number;
  /** Per-branch sale price overrides; a branch without a row sells at `price`. */
  branchPrices?: Array<{ branchId: number; price: number }>;
  promoEnabled?: boolean;
  promoPrice?: number | null;
  promoDiscountPercent?: number | null;
  promoImage?: string | null;
  promoEndsAt?: string | null;
  promoMarketingMessage?: string | null;
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
  freezeTotalDays?: number | null; // total days the package may stay frozen (null = unlimited)
  includesSpa?: boolean;
  spaCount?: number | null;
  isActive?: boolean;
  classTypeIds?: number[];
  classTypes?: Array<{ id: number; name: string; color: string }>;
  /** Free-text notes shown to members on this package in the app. */
  appNotes?: string | null;
  /** App home sections this package appears under (`ClubPackageCategoryItem.key` values). */
  categories?: string[];
}

/** An app home section ("الفئة") managed from the packages screen. */
export interface ClubPackageCategoryItem {
  id: number;
  /** What packages are tagged with; fixed at creation. */
  key: string;
  name: string;
  nameEn?: string | null;
  /** Uploaded artwork path; null means the app's bundled artwork for this key. */
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Filled by the server itself (عروض / برايفت / حصص) — cannot be deleted. */
  isSystem: boolean;
  /** Active packages tagged with this section. */
  packageCount?: number;
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
  customerName: string;
  memberId: number | null;
  memberName?: string | null;
  memberCode?: string | null;
  memberProfilePicture?: string | null;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  subscriptionValue: number;
  discountEnabled: boolean;
  discountCodeId?: number | null;
  discountPercentage?: number | null;
  discountValue: number;
  paidAmount: number;
  remainingAmount: number;
  lockerId: number;
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

export interface ClubLockerHandoff {
  id: number;
  memberId: number;
  memberName: string;
  memberCode: string | null;
  assignedAt: string;
  releasedAt: string | null;
}

export interface ClubLockerDetails {
  id: number;
  lockerNumber: string;
  mainBranchId: number;
  subBranchId: number;
  isAvailable: boolean;
  section?: 'male' | 'female' | 'shared';
  totalBookings: number;
  currentSubscription: ClubLockerSubscriptionDetail | null;
  lastBooking: ClubLockerSubscriptionDetail | null;
  history: ClubLockerSubscriptionDetail[];
  currentHandoff?: ClubLockerHandoff | null;
  handoffs?: ClubLockerHandoff[];
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
    cafeRevenue: number;
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
  period: { start: string; end: string; days: number };
  branchId: number | null;
}
