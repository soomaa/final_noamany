export type FitnessDifficulty = 'easy' | 'medium' | 'hard';
export type FitnessHallStatus = 'available' | 'maintenance' | 'unavailable';
export type FitnessClassStatus = 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
export type FitnessBookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface MemberRowFields {
  memberId?: number | null;
  memberName?: string | null;
  memberCode?: string | null;
  memberPhone?: string | null;
  memberGender?: string | null;
  memberProfilePicture?: string | null;
}

export interface WorkoutProgramRow extends MemberRowFields {
  id: number;
  memberId: number | null;
  name: string;
  goal: string | null;
  difficulty: FitnessDifficulty;
  durationWeeks: number | null;
  description: string | null;
  isActive: boolean;
}

export interface WorkoutTemplateRow {
  id: number;
  name: string;
  description: string | null;
  exercisesJson: unknown;
  isActive: boolean;
}

export interface ExerciseRow {
  id: number;
  name: string;
  category: string | null;
  muscleGroup: string | null;
  description: string | null;
  instructions: string | null;
  setsDefault: number | null;
  repsDefault: number | null;
  difficulty: FitnessDifficulty;
  isActive: boolean;
}

export interface MemberProgressRow extends MemberRowFields {
  id: number;
  memberId: number;
  recordDate: string;
  weight: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
  goals: string | null;
  notes: string | null;
}

export interface InbodyMeasurementRow extends MemberRowFields {
  id: number;
  memberId: number;
  branchId: number | null;
  measurementDate: string;
  weight: number | null;
  heightCm: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
  bmi: number | null;
  notes: string | null;
  reportUrl?: string | null;
  settlementSource: 'subscription' | 'package' | 'package_purchase' | 'paid_single' | 'legacy';
  subscriptionId: number | null;
  entitlementId: number | null;
  invoiceId: number | null;
}

export interface InbodyOffer {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  measurementCount: number;
  validityDays: number | null;
  branchId: number;
  isActive?: boolean;
}

export interface InbodyBalance {
  id: number;
  source: 'subscription' | 'package';
  label: string;
  remaining: number;
  expiresAt: string | null;
}

export interface InbodyMemberContext {
  member: {
    id: number;
    memberCode: string;
    name: string;
    branchId: number;
  };
  totalRemaining: number;
  hasActiveMembership: boolean;
  allowWithoutActiveMembership: boolean;
  balances: InbodyBalance[];
  offers: InbodyOffer[];
}

export interface InbodyBranchSettings {
  branchId: number;
  allowWithoutActiveMembership: boolean;
  offers: InbodyOffer[];
}

export interface PhysicalAssessmentRow extends MemberRowFields {
  id: number;
  memberId: number;
  assessDate: string;
  assessor: string | null;
  scoresJson: unknown;
  notes: string | null;
}

/** Who a class slot / session is for. */
export type ClassAudience = 'men' | 'women' | 'kids' | 'mixed';

export interface ClubClassRow {
  id: number;
  classTypeId: number | null;
  templateSlotId?: number | null;
  className: string;
  description: string | null;
  trainerId: number;
  branchId: number;
  hallId: number | null;
  classDate: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  price: number;
  status: FitnessClassStatus;
  audience?: ClassAudience;
  notes: string | null;
  isActive: boolean;
  enrollmentCount: number;
  trainer?: { id: number; name: string };
  hall?: { id: number; name: string; hallNumber: string } | null;
  classType?: { id: number; name: string; color: string } | null;
  cancelledReason?: string | null;
  rescheduledAt?: string | null;
}

export interface ClassEnrollmentRow extends MemberRowFields {
  id: number;
  memberId: number;
  enrollmentDate: string;
  attendanceStatus: string;
  attendanceTime: string | null;
  bookingSource?: string;
  subscriptionId?: number | null;
  notes: string | null;
}

export interface ClubClassScheduleSlot {
  id?: number;
  weekday: number;
  startTime: string;
  endTime: string;
  branchId: number;
  hallId: number | null;
  trainerId: number | null;
  maxCapacity: number;
  price: number;
  audience?: ClassAudience;
  trainer?: { id: number; name: string } | null;
  hall?: { id: number; name: string; hallNumber: string } | null;
}

export interface ClubTrainerScheduleSlot {
  id?: number;
  classTypeId?: number;
  trainerId: number;
  weekday: number;
  startTime: string;
  endTime: string;
  branchId: number;
  hallId: number | null;
  maxCapacity: number;
  audience?: ClassAudience;
  hall?: { id: number; name: string; hallNumber: string } | null;
}

export interface ClubClassType {
  allowExternal?: boolean;
  linkedSubscriptionTypeIds?: number[];
  commissionPercentage?: number | null;
  id: number;
  name: string;
  color: string;
  defaultDurationMinutes: number;
  singleSessionPrice: number;
  subscriptionSessionsCount: number;
  useDefaultSchedule: boolean;
  isActive: boolean;
  eligibleTrainerIds: number[];
  eligibleTrainers: Array<{ id: number; name: string; phone?: string | null }>;
  scheduleSlots: ClubClassScheduleSlot[];
  trainerScheduleSlots?: ClubTrainerScheduleSlot[];
  sessionsCount: number;
  packagesCount: number;
}

export interface ClassManagementReports {
  sessionHistory?: Array<{
    id: number; className: string; classDate: string; startTime: string; endTime: string;
    trainerId: number; trainerName: string; status: string; percentage: number;
    attendance: number; revenue: number; commission: number; unresolvedValues: number;
    attendees: Array<{ enrollmentId: number; memberId: number; memberName: string;
      subscriptionNumber: string | null; subscriptionType: string | null;
      packageValue: number | null; packageSessions: number | null; sessionValue: number | null;
      percentage: number; commission: number | null; historicalEstimate: boolean }>;
  }>;
  summary: { sessions: number; attendance: number; demand: number; revenue: number };
  classTypes: Array<{
    classTypeId: number | null;
    name: string;
    color: string;
    sessions: number;
    totalAttendance: number;
    averageAttendance: number;
    busiestWeekday: number | null;
    topTrainer: { id: number; name: string; sessions: number } | null;
    revenue: number;
    demand: number;
  }>;
  trainers: Array<{
    trainerId: number;
    name: string;
    isExternal: boolean;
    sessions: number;
    trainingHours: number;
    totalTrainees: number;
    attendedRegistrations: number;
    revenue: number;
    averageAttendance: number;
    adherenceRate: number;
    cancelledSessions: number;
    noShows: number;
    commissionPercentage: number;
    commissionValue: number;
  }>;
  revenue: ClassManagementReports['classTypes'];
}

export interface ClubClassDetail extends ClubClassRow {
  enrollments?: ClassEnrollmentRow[];
}

export interface ClubClassStatistics {
  totalClasses: number;
  scheduledClasses: number;
  completedClasses: number;
  cancelledClasses: number;
  totalEnrollments: number;
  totalAttendances: number;
  attendanceRate: number;
}

export interface ClubHallRow {
  id: number;
  name: string;
  hallNumber: string;
  capacity: number;
  branchId: number;
  description: string | null;
  status: FitnessHallStatus;
}

export interface ClubHallBookingRow extends MemberRowFields {
  id: number;
  hallId: number;
  memberId: number | null;
  customerName: string | null;
  bookingDate: string;
  startTime: string;
  endTime: string;
  numberOfPeople: number;
  status: FitnessBookingStatus;
  notes: string | null;
  hall?: ClubHallRow;
}

export interface ClubTrainerRow {
  id: number;
  employeeId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  /** `specialization` split into chips; the list the member app renders. */
  specializations?: string[];
  /** Reception/calendar chip colour (#RRGGBB); null falls back to a derived colour. */
  color: string | null;
  experience: string | null;
  bio: string | null;
  /** Opaque public upload reference (`public-file:<id>`) of the trainer portrait. */
  imageUrl?: string | null;
  ratingAvg: number;
  isActive: boolean;
}

export interface ClubTrainerSalaryRow {
  id: number;
  trainerId: number;
  baseSalary: number;
  classCommissionPercentage: number;
  subscriptionCommissionPercentage: number;
  effectiveDate: string;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
  trainer?: { id: number; name: string };
}

export interface ClubTrainerDetails {
  trainer: ClubTrainerRow;
  activeSalary: ClubTrainerSalaryRow | null;
  statistics: {
    totalClasses: number;
    totalDays: number;
    totalEnrollments: number;
    uniqueMembers: number;
    totalClassRevenue: number;
    totalClassCommission: number;
  };
  classes: Array<{
    id: number;
    className: string;
    classDate: string;
    startTime: string;
    endTime: string;
    status: string;
    price: number;
    maxCapacity: number;
    enrollmentCount: number;
  }>;
}

export interface TrainerCommissionTier {
  id?: number;
  minAchievementPct: number;
  maxAchievementPct: number | null;
  commissionPercent: number;
  label?: string | null;
}

export interface TrainerWorkspaceRating {
  id: number;
  trainerId: number;
  attendanceId?: number | null;
  memberId: number | null;
  memberName?: string | null;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface TrainerEarningPayment {
  id: number;
  trainerId: number;
  amount: number;
  paymentDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  notes: string | null;
}

export interface TrainerWorkspace {
  trainer: ClubTrainerRow;
  stats: {
    sessions: number;
    uniqueMembers: number;
    attendance: number;
    revenue: number;
    target: number;
    targetUnit: 'members' | 'money';
    achievementPct: number;
    commissionPercent: number;
    earned: number;
    paid: number;
    remaining: number;
    overpaid: number;
    ratingAvg: number;
    ratingCount: number;
  };
  activeSalary: ClubTrainerSalaryRow | null;
  commissionSetting: {
    employeeId: number;
    trainerId: number | null;
    targetUnit: 'members' | 'money';
    baseTarget: number;
    commissionMode: 'attendance' | 'tiered' | 'combined';
    privateCommissionMode: 'salary' | 'fixed';
    privateCommissionPercent: number;
    targetPeriodMode: 'monthly' | 'custom' | 'days';
    targetStartDate: string | null;
    targetEndDate: string | null;
    targetDays: number | null;
    currentCycle?: import('@/lib/sales-commission').TargetCycle;
    tiers: TrainerCommissionTier[];
  } | null;
  classes: ClubTrainerDetails['classes'];
  payments: TrainerEarningPayment[];
  ratings: TrainerWorkspaceRating[];
  ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  currentCycle: import('@/lib/sales-commission').TargetCycle;
}

export type TrainerPerformanceRow = TrainerWorkspace['stats'] & {
  trainerId: number;
  name: string;
  specialization: string | null;
  isActive: boolean;
};

export interface TrainerPerformanceResponse {
  data: TrainerPerformanceRow[];
  total: number;
  page: number;
  pageSize: number;
  dateFrom: string;
  dateTo: string;
  totals: Pick<TrainerPerformanceRow, 'sessions' | 'revenue' | 'earned' | 'paid' | 'remaining' | 'ratingAvg'>;
}


export interface ClubFacilityRow {
  id: number;
  name: string;
  branchId: number;
  facilityType: string;
  capacity: number | null;
  description: string | null;
  status: FitnessHallStatus;
  isActive: boolean;
}

export interface ClubEquipmentRow {
  imageUrl?: string | null;
  id: number;
  facilityId: number | null;
  name: string;
  serialNumber: string | null;
  branchId: number;
  status: FitnessHallStatus;
  purchaseDate: string | null;
  notes: string | null;
  facility?: { id: number; name: string } | null;
}

export interface ClubEquipmentMaintenanceRow {
  id: number;
  equipmentId: number;
  scheduledDate: string;
  completedDate: string | null;
  description: string | null;
  cost: number | null;
  status: string;
  equipment?: { id: number; name: string; serial_number?: string };
}

export interface ClubSpaServiceRow {
  id: number;
  name: string;
  description: string | null;
  duration: number;
  price: number;
  branchId: number | null;
  isActive: boolean;
}

export interface ClubSpaInvoiceRow extends MemberRowFields {
  id: number;
  invoiceNumber: string;
  memberId: number;
  serviceId: number;
  branchId: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  invoiceDate: string;
  status: string;
  paymentMethod: string | null;
  subscriptionId: number | null;
  coveredBySubscription: boolean;
  service?: { id: number; name: string };
}

export interface ClubSpaBookingRow extends MemberRowFields {
  id: number;
  bookingNumber: string;
  memberId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  serviceId: number;
  branchId: number;
  bookingDate: string;
  bookingTime: string;
  duration: number;
  price: number;
  status: string;
  paymentStatus: string;
  notes: string | null;
  service?: { id: number; name: string; price: number; duration: number };
}

export interface ClubInbodyInvoiceRow extends MemberRowFields {
  id: number;
  invoiceNumber: string;
  isMember: boolean;
  memberId: number | null;
  customerName: string | null;
  serviceId: number | null;
  branchId: number;
  unitPrice: number;
  totalAmount: number;
  invoiceDate: string;
  invoiceTime: string | null;
  status: string;
  paymentMethod: string | null;
  subscriptionId: number | null;
  coveredBySubscription: boolean;
}

/** Daily booking board — captains as columns, the clock as rows. */
export interface BookingBoardMember {
  memberId: number;
  memberName: string | null;
  memberCode: string | null;
  memberPhone: string | null;
  memberGender: string | null;
  memberProfilePicture: string | null;
  attendanceStatus: string;
  bookingSource: string;
}

export interface BookingBoardEntry {
  kind: 'booked' | 'free';
  startTime: string;
  endTime: string;
  durationMinutes: number;
  branchId: number;
  classTypeId: number | null;
  className: string;
  color: string;
  hallId: number | null;
  hallName: string | null;
  maxCapacity: number;
  enrollmentCount: number;
  remainingSeats: number;
  bookable: boolean;
  price: number;
  classId?: number;
  status?: FitnessClassStatus;
  members?: BookingBoardMember[];
  templateSlotId?: number;
}

export interface BookingBoardTrainer {
  trainerId: number;
  trainerName: string;
  imageUrl: string | null;
  specialization: string | null;
  entries: BookingBoardEntry[];
  bookedSessions: number;
  freeSlots: number;
  bookedSeats: number;
  capacity: number;
  firstFreeTime: string | null;
}

export interface BookingBoardBranch {
  branchId: number;
  branchName: string;
  parentId: number;
  bookedSessions: number;
  freeSlots: number;
  bookedSeats: number;
  trainers: number;
}

export interface BookingBoardDay {
  date: string;
  weekday: number;
  isPastDate: boolean;
  axis: { startTime: string; endTime: string; slotMinutes: number };
  branches: BookingBoardBranch[];
  trainers: BookingBoardTrainer[];
  summary: {
    trainers: number;
    bookedSessions: number;
    freeSlots: number;
    bookedSeats: number;
    capacity: number;
  };
}

export interface BookingBoardTarget {
  trainerId: number;
  trainerName: string;
  date: string;
  startTime: string;
  endTime: string;
  branchId: number;
  entry?: BookingBoardEntry;
}
