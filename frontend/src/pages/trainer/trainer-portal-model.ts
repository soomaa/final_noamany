import { uiStatic } from '@/lib/ui-static';
export interface TrainerScheduleItem {
  id: number;
  className: string;
  classDate: string;
  startTime: string;
  endTime: string;
  hall: { id?: number; name: string; hallNumber: string | null } | null;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  color: string;
}

export const trainerPortalSections = ['calendar', 'attendance', 'earnings', 'private'] as const;
export type TrainerPortalSection = (typeof trainerPortalSections)[number];

export function resolveTrainerPortalSection(value: string | null | undefined): TrainerPortalSection {
  return trainerPortalSections.includes(value as TrainerPortalSection)
    ? value as TrainerPortalSection
    : 'calendar';
}

export interface TrainerPortalDashboard {
  trainer: { id: number; name: string; specialization: string | null; imageUrl: string | null };
  statistics: {
    scheduledClasses: number;
    completedClasses: number;
    totalTrainees: number;
    totalAttendance: number;
    privateSessions: number;
    averageAttendance: number;
    adherenceRate: number;
    totalEarnings: number;
  };
  attendance: Array<{
    classId: number;
    className: string;
    classDate: string;
    attended: number;
    absent: number;
    registered: number;
    attendanceRate: number;
  }>;
  earnings: {
    total: number;
    paid: number;
    remaining: number;
    overpaid: number;
    commissionMode: 'attendance' | 'tiered' | 'combined';
    items: Array<{
      classId: number;
      className: string;
      classDate: string;
      attended: number;
      unitPrice: number;
      commissionPercentage: number;
      revenue: number;
      amount: number;
    }>;
    privateItems: Array<{
      id: number;
      attendanceId: number;
      subscriptionId: number;
      subscriptionNumber: string;
      subscriptionType: string | null;
      memberId: number;
      memberName: string;
      attendanceDate: string;
      sequence: number;
      revenue: number;
      commissionPercentage: number;
      amount: number;
      refundedAmount?: number;
    }>;
    payments: Array<{ id: number; amount: number; paymentDate: string; notes: string | null }>;
  };
  totals: { attended: number; absent: number };
}

export function monthRange(anchor: string) {
  const match = /^(\d{4})-(\d{2})/.exec(anchor);
  if (!match) throw new Error('Invalid month anchor');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    dateFrom: `${match[1]}-${match[2]}-01`,
    dateTo: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function shiftPortalMonth(anchor: string, offset: number) {
  const match = /^(\d{4})-(\d{2})/.exec(anchor);
  if (!match) throw new Error('Invalid month anchor');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function trainerClassStatusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: uiStatic('مجدولة'),
    ongoing: uiStatic('جارية'),
    completed: uiStatic('مكتملة'),
    cancelled: uiStatic('ملغاة'),
  };
  return labels[status] ?? status;
}

export interface TrainerPrivateClient {
  id: number;
  memberId: number;
  memberCode: string;
  memberName: string;
  phone: string | null;
  packageName: string;
  endDate: string;
  status: string;
  sessionsRemaining: number | null;
  checkedInToday: boolean;
}

export function sortPrivateClients<T extends { sessionsRemaining: number | null; endDate: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.sessionsRemaining != null && b.sessionsRemaining == null) return -1;
    if (a.sessionsRemaining == null && b.sessionsRemaining != null) return 1;
    if (a.sessionsRemaining != null && b.sessionsRemaining != null && a.sessionsRemaining !== b.sessionsRemaining) return a.sessionsRemaining - b.sessionsRemaining;
    return a.endDate.localeCompare(b.endDate);
  });
}

export function canPrivateCheckIn(client: Pick<TrainerPrivateClient, 'status' | 'sessionsRemaining'> & { checkedInToday?: boolean }) {
  return client.status === 'active' && client.sessionsRemaining !== 0 && !client.checkedInToday;
}
