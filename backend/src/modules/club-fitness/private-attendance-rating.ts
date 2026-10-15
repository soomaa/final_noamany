export function assertPrivateAttendanceRating(
  attendance: { status: string; memberId: number; trainerId: number },
  request: { memberId: number; trainerId: number },
) {
  if (attendance.status !== 'checked_out') throw new Error('يجب تسجيل الخروج قبل تقييم الجلسة');
  if (attendance.memberId !== request.memberId) throw new Error('هذا الحضور لا يخص العضو');
  if (attendance.trainerId !== request.trainerId) throw new Error('هذا الحضور لا يخص المدرب');
  return true;
}
