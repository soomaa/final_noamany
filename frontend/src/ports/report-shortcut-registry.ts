import type { ComponentType } from 'react';

export interface ReportShortcut {
  href: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export interface ReportShortcutGroup {
  group: string;
  items: ReportShortcut[];
}

let groups: ReportShortcutGroup[] = [];

export function registerReportShortcutGroups(next: readonly ReportShortcutGroup[]): void {
  groups = next.map((group) => ({ ...group, items: [...group.items] }));
}

export function getReportShortcutGroups(): readonly ReportShortcutGroup[] {
  return groups;
}
