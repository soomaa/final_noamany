/** Gym ops API types — entitlement, search, audit, automation */

export interface EntitlementReason {
  code: string;
  messageAr: string;
  messageEn: string;
  severity: 'block' | 'warn';
}

export interface EntitlementResult {
  allowed: boolean;
  allowGraceSessions: boolean;
  member: {
    id: number;
    memberCode: string;
    name: string;
    phone: string | null;
    branchId: number;
    isActive: boolean;
  };
  activeSubscription: {
    id: number;
    subscriptionNumber: string;
    subscriptionType: string | null;
    status: string;
    derivedStatus: string;
    remainingAmount: number;
    isTimeBased: boolean;
    timeFrom: string | null;
    timeTo: string | null;
    isLinkedToSessions: boolean;
    isSpecial: boolean;
    specialClassTypeId: number | null;
    sessionsRemaining: number | null;
    allowMultipleDailyEntries: boolean;
    daysRemaining?: number | null;
    startDate?: string;
    endDate?: string;
    projectedEndDate?: string | null;
  } | null;
  /** Expired / latest sub for reception grace UX when check-in is denied. */
  latestSubscription?: {
    id: number;
    subscriptionNumber: string;
    subscriptionType: string | null;
    status: string;
    derivedStatus: string;
    remainingAmount: number;
    endDate: string;
    projectedEndDate?: string | null;
    startDate: string;
    daysRemaining?: number | null;
    sessionsRemaining?: number | null;
  } | null;
  reasons: EntitlementReason[];
  warnings: EntitlementReason[];
}

export interface ClubSearchHit {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  cardNumber: string | null;
  branchId: number;
  gender?: 'male' | 'female' | null;
  isActive: boolean;
  matchType: string;
  activeSubscriptionType: string | null;
  subscriptionStatus: string | null;
  remainingAmount: number | null;
  lastCheckIn: string | null;
  score: number;
}

export interface RecentCheckIn {
  memberId: number;
  memberCode: string;
  memberName: string;
  branchId: number;
  gender?: 'male' | 'female' | null;
  checkInTime: string;
  attendanceDate: string;
  status: string;
}

export interface BusinessAuditEntry {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: number | null;
  actorName: string | null;
  before: unknown;
  after: unknown;
  changedFields: string[] | null;
  reason: string | null;
  createdAt: string;
}

export interface CheckInResponse {
  attendance: {
    id: number;
    memberId: number;
    memberCode: string;
    memberName: string;
    subscriptionId?: number | null;
    subscriptionType?: string | null;
    attendanceDate: string;
    status: string;
  };
  entitlement: EntitlementResult;
  subscription?: {
    id: number;
    type: string | null;
    isLinkedToSessions: boolean;
    sessionsRemaining: number | null;
    daysRemaining?: number | null;
    endDate?: string | null;
    consumedSession: boolean;
  } | null;
  classAttendance?: ScheduledClassSlot | null;
  overridden?: boolean;
}

/** The scheduled class a member is checked into, as reception sees it. */
export interface ScheduledClassSlot {
  classId: number;
  className: string;
  classColor: string | null;
  trainerId: number;
  trainerName: string;
  trainerColor: string | null;
  hallName: string | null;
  startTime: string;
  endTime: string;
  /** Whether the class is running now, still to come, or just finished. */
  position: 'now' | 'upcoming' | 'past' | null;
}

export interface NextScheduledClass {
  classTypeId: number | null;
  class: ScheduledClassSlot | null;
  eligibleTrainers: Array<{ id: number; name: string; color: string | null }>;
}

export interface StaffTask {
  id: number;
  taskType: string;
  title: string;
  description: string | null;
  memberId: number | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
}

export interface AutomationWorkflow {
  id: number;
  key: string;
  nameAr: string;
  nameEn: string | null;
  triggerType: string;
  isActive: boolean;
  runsCount: number;
}
