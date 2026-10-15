import { summarizeTrainerPerformance } from './trainer-performance';

describe('trainer management performance summary', () => {
  it('combines group classes and private sessions without double-counting trainees', () => {
    expect(summarizeTrainerPerformance({
      classes: [
        { status: 'completed', price: 200, enrollments: [{ member_id: 1, attendance_status: 'attended' }, { member_id: 2, attendance_status: 'absent' }] },
        { status: 'scheduled', price: 150, enrollments: [{ member_id: 1, attendance_status: 'attended' }] },
      ],
      privateSessions: [
        { memberId: 3, revenue: 500 },
        { memberId: 1, revenue: 400 },
      ],
      target: 5,
      targetUnit: 'members',
      commissionDue: 210,
    })).toEqual({
      scheduledClasses: 2,
      completedClasses: 1,
      totalTrainees: 3,
      attended: 2,
      absent: 1,
      privateSessions: 2,
      sessions: 4,
      revenue: 1250,
      target: 5,
      targetUnit: 'members',
      achievementPct: 60,
      attendanceRate: 66.67,
      commissionDue: 210,
    });
  });
});
