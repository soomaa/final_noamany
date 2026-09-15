export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  read: boolean;
  date: string | null;
  time: string | null;
}

export interface AlertEntry {
  empId: number;
  empCode: number | null;
  name: string | null;
  date: string;
  daysLeft: number;
}

export interface AlertsGrouped {
  contractExpiring: AlertEntry[];
  residencyExpiring: AlertEntry[];
  insuranceExpiring: AlertEntry[];
  probationEnding: AlertEntry[];
  birthdays: AlertEntry[];
}

export type AlertGroupKey = keyof AlertsGrouped;
