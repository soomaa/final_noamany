export function resolveTreasuryReportDate(
  selectedDate: string,
  currentSessionDate: string | null | undefined,
  userSelectedDate: boolean,
) {
  if (!userSelectedDate && currentSessionDate) {
    return currentSessionDate;
  }

  return selectedDate;
}
