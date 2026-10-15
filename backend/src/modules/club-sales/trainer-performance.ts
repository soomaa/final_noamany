import { roundMoney } from './club-sales.constants';

type Enrollment = { member_id: number; attendance_status: string };
type PerformanceClass = { status: string; price: unknown; enrollments: Enrollment[] };
type PrivateSession = { memberId: number; revenue: number };

export function summarizeTrainerPerformance(input: {
  classes: PerformanceClass[];
  privateSessions: PrivateSession[];
  target: number;
  targetUnit: string;
  commissionDue: number;
}) {
  const memberIds = new Set<number>();
  let attended = 0;
  let absent = 0;
  for (const cls of input.classes) {
    for (const enrollment of cls.enrollments) {
      if (enrollment.attendance_status === 'cancelled') continue;
      memberIds.add(enrollment.member_id);
      if (enrollment.attendance_status === 'attended') attended += 1;
      if (enrollment.attendance_status === 'absent') absent += 1;
    }
  }
  input.privateSessions.forEach((session) => memberIds.add(session.memberId));
  const sessions = input.classes.length + input.privateSessions.length;
  const revenue = roundMoney(
    input.classes.reduce((sum, cls) => sum + Number(cls.price ?? 0), 0)
      + input.privateSessions.reduce((sum, session) => sum + session.revenue, 0),
  );
  const achieved = input.targetUnit === 'money' ? revenue : memberIds.size;
  const attendanceTotal = attended + absent;
  return {
    scheduledClasses: input.classes.length,
    completedClasses: input.classes.filter((cls) => cls.status === 'completed').length,
    totalTrainees: memberIds.size,
    attended,
    absent,
    privateSessions: input.privateSessions.length,
    sessions,
    revenue,
    target: input.target,
    targetUnit: input.targetUnit,
    achievementPct: input.target > 0 ? roundMoney((achieved / input.target) * 100) : achieved > 0 ? 100 : 0,
    attendanceRate: attendanceTotal ? roundMoney((attended / attendanceTotal) * 100) : 0,
    commissionDue: input.commissionDue,
  };
}
