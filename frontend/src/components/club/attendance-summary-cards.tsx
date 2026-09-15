import { useQuery } from '@tanstack/react-query';
import { ClubStatCard } from '@/components/club/stat-card';
import { api } from '@/lib/api';
import { useClubT } from '@/hooks/use-club-t';

export interface ClubAttendanceStatistics {
  todayCheckIns: number;
  todayCheckOuts: number;
  activeCheckIns: number;
  totalRecords: number;
}

interface AttendanceStatisticsParams {
  branch?: string;
  startDate?: string;
  endDate?: string;
}

export function useClubAttendanceStatistics(
  params: AttendanceStatisticsParams = {},
  options: { enabled?: boolean; refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: ['club-attendance', 'statistics', params],
    queryFn: async () => {
      const { data } = await api.get<ClubAttendanceStatistics>('/club-attendance/statistics', {
        params,
      });
      return data;
    },
    enabled: options.enabled,
    refetchInterval: options.refetchInterval,
  });
}

export function AttendanceSummaryCards({
  statistics,
}: {
  statistics: ClubAttendanceStatistics | undefined;
}) {
  const ct = useClubT();
  if (!statistics) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ClubStatCard label={ct('members.attendanceToday')} value={statistics.todayCheckIns} />
      <ClubStatCard label={ct('members.attendanceCheckout')} value={statistics.todayCheckOuts} />
      <ClubStatCard label={ct('members.attendanceActive')} value={statistics.activeCheckIns} />
      <ClubStatCard label={ct('members.attendanceTotal')} value={statistics.totalRecords} />
    </div>
  );
}
