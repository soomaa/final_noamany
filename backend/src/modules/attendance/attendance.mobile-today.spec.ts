import { AttendanceService } from './attendance.service';
import { todayIso } from '../../common/utils/legacy-date.util';

describe('AttendanceService mobileToday (home card)', () => {
  const today = todayIso();
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  const user = { sub: 9, emp_code: 7 } as never;
  const service = (rows: unknown[]) =>
    new AttendanceService({
      employees: { findUnique: jest.fn().mockResolvedValue({ emp_code: 1007 }) },
      tbl_hdoor_emps: { findMany: jest.fn().mockResolvedValue(rows) },
    } as never);

  it('returns an empty card when nothing is recorded today (no stale times)', async () => {
    await expect(service([]).mobileToday(user)).resolves.toEqual(expect.objectContaining({
      id: null, empCode: 1007, date: today, checkIn: null, checkOut: null, lateMin: 0,
    }));
  });

  it("shows yesterday's still-open night shift before today's rows", async () => {
    const rows = [
      { hodoor_id: 2, action_date: today, hdoor_time: null, ensraf_time: null, late_min: null },
      { hodoor_id: 1, action_date: yesterday, hdoor_time: '11:05 PM', ensraf_time: null, late_min: 5, dwam_hdoor_time: '11:00 PM' },
    ];
    await expect(service(rows).mobileToday(user)).resolves.toEqual(expect.objectContaining({
      id: 1, date: yesterday, checkIn: '11:05 PM', checkOut: null, lateMin: 5, scheduledIn: '11:00 PM',
    }));
  });

  it("shows today's row with check-in and check-out", async () => {
    const rows = [{ hodoor_id: 3, action_date: today, hdoor_time: '09:10 AM', ensraf_time: '05:02 PM', late_min: 10, mobaker_min: 0 }];
    await expect(service(rows).mobileToday(user)).resolves.toEqual(expect.objectContaining({
      id: 3, checkIn: '09:10 AM', checkOut: '05:02 PM', lateMin: 10,
    }));
  });
});
