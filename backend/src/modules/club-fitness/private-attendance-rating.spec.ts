import { assertPrivateAttendanceRating } from './private-attendance-rating';

describe('private attendance ratings', () => {
  it('requires a checked-out private attendance owned by the same member and trainer', () => {
    expect(() => assertPrivateAttendanceRating({ status: 'checked_in', memberId: 7, trainerId: 4 }, { memberId: 7, trainerId: 4 })).toThrow('الخروج');
    expect(() => assertPrivateAttendanceRating({ status: 'checked_out', memberId: 8, trainerId: 4 }, { memberId: 7, trainerId: 4 })).toThrow('العضو');
    expect(assertPrivateAttendanceRating({ status: 'checked_out', memberId: 7, trainerId: 4 }, { memberId: 7, trainerId: 4 })).toBe(true);
  });
});
