import { AttendanceService, shiftTimingProblems } from './attendance.service';

const shift = (times: [string, string, string, string, string, string]) => ({
  hdoor_from_time: times[0], hdoor_to_time: times[1], hdoor_khasm_from: times[2],
  ensraf_from_time: times[3], ensraf_to_time: times[4], ensraf_khasm_from: times[5],
});

describe('shift timing checks (production shift settings)', () => {
  it('accepts normal day and night shifts, including ones that cross midnight', () => {
    expect(shiftTimingProblems(shift(['08:00 AM', '03:20 PM', '09:00 AM', '04:55 PM', '11:30 PM', '06:00 PM']))).toEqual({ errors: [], warnings: [] });
    expect(shiftTimingProblems(shift(['05:00 PM', '12:15 AM', '06:00 PM', '01:55 AM', '05:30 AM', '03:00 AM']))).toEqual({ errors: [], warnings: [] });
    expect(shiftTimingProblems(shift(['11:00 PM', '07:00 AM', '12:00 AM', '08:55 AM', '11:00 AM', '10:00 AM'])).errors).toEqual([]);
  });

  it('flags AM/PM mistakes that put punches on the wrong shift', () => {
    // "صباحي 2": end of check-in typed 10:30 PM instead of AM -> an 18h check-in window.
    expect(shiftTimingProblems(shift(['04:06 AM', '10:30 PM', '05:00 AM', '12:55 PM', '03:00 PM', '02:00 PM'])).errors[0]).toContain('فترة الحضور');
    // "مسائى6": early-leave/overtime time 10:00 AM is outside the 11:55 PM – 04:30 AM check-out window.
    expect(shiftTimingProblems(shift(['03:00 PM', '10:30 PM', '04:00 PM', '11:55 PM', '04:30 AM', '10:00 AM'])).errors[0]).toContain('احتساب الإضافي');
    // Deduction start after the check-in window closes.
    expect(shiftTimingProblems(shift(['09:00 PM', '09:30 PM', '11:09 PM', '01:55 AM', '02:30 AM', '02:00 AM'])).errors[0]).toContain('بداية الخصم');
  });

  it('refuses to save a shift with such a mistake and saves a night shift', async () => {
    const prisma = {
      tbl_hdodr_setting: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 1, ...data })),
      },
    };
    const service = new AttendanceService(prisma as never);
    await expect(service.createShift({
      title: 'خطأ', hdoorFromTime: '04:06 AM', hdoorToTime: '10:30 PM', hdoorKhasmFrom: '05:00 AM',
      ensrafFromTime: '12:55 PM', ensrafToTime: '03:00 PM', ensrafKhasmFrom: '02:00 PM',
    })).rejects.toThrow('فترة الحضور');
    await expect(service.createShift({
      title: 'ليلي', hdoorFromTime: '11:00 PM', hdoorToTime: '07:00 AM', hdoorKhasmFrom: '12:00 AM',
      ensrafFromTime: '08:55 AM', ensrafToTime: '11:00 AM', ensrafKhasmFrom: '10:00 AM',
    })).resolves.toEqual(expect.objectContaining({ title: 'ليلي', warnings: [] }));
  });
});
