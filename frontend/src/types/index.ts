import { uiStatic } from '@/lib/ui-static';
export interface AuthUser {
  sub: number;
  level: number | null;
  emp_code: number | null;
  branch: number;
  branch_name: string | null;
  man_women_type: number;
  name: string | null;
  image: string | null;
  job_title: string | null;
  is_trainer: boolean;
  trainer_id: number | null;
  /** Level 1 or an active RBAC super-admin role (system-wide authority). */
  is_super_admin?: boolean;
}

export interface MenuNode {
  id: number;
  title: string;
  link: string;
  icon: string;
  order: number;
  bgColor: string | null;
  color: string | null;
  children: MenuNode[];
}

export interface DashboardSummary {
  totalEmployees: number;
  presentToday: number;
  lateToday: number;
  onLeaveToday: number;
  presentPct: number;
  avgLateMinutes: number;
  weekly: { label: string; pct: number }[];
  todayAttendance: AttendanceRow[];
}

export interface AttendanceRow {
  hodoorId: number;
  empCode: number | null;
  name: string | null;
  department: string | null;
  checkIn: string | null;
  checkOut: string | null;
  lateMin: number | null;
  status: 'present' | 'late' | 'leave' | 'absent';
}

export const LEVEL_LABELS: Record<number, string> = {
  1: uiStatic('مدير على النظام'),
  2: uiStatic('موظف على النظام'),
  3: uiStatic('مدير فرع-ادارة'),
};
