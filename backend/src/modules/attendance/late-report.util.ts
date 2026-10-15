export interface LateReportInputRow {
  memberCode: number;
  actionDate: string | null;
  lateMin: number | null;
}

export interface LateReportTotals {
  withPermission: number;
  withoutPermission: number;
}

/**
 * Aggregate already-filtered late punches in memory after two bounded batch queries.
 * Permission keys include the employee code so one employee's permission can never
 * classify another employee's punch on the same date.
 */
export function aggregateLateRows(
  rows: LateReportInputRow[],
  approvedPermissionKeys: ReadonlySet<string>,
): Map<number, LateReportTotals> {
  const totals = new Map<number, LateReportTotals>();

  for (const row of rows) {
    const late = Math.trunc(row.lateMin ?? 0);
    if (late <= 0) continue;

    const current = totals.get(row.memberCode) ?? {
      withPermission: 0,
      withoutPermission: 0,
    };
    const permissionKey = `${row.memberCode}:${row.actionDate ?? ""}`;
    if (row.actionDate && approvedPermissionKeys.has(permissionKey)) {
      current.withPermission += late;
    } else {
      current.withoutPermission += late;
    }
    totals.set(row.memberCode, current);
  }

  return totals;
}
