/** Normalize the 12/24-hour strings posted by the legacy Arabic Flutter UI. */
export function normalizeLegacyTime(raw: string): string {
  const digits = raw.trim().replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const match = digits.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(ص|م|am|pm)?$/i);
  if (!match) return digits;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const meridiem = match[4]?.toLowerCase();
  if (minute > 59 || second > 59) return digits;

  if (meridiem) {
    if (hour < 1 || hour > 12) return digits;
    hour %= 12;
    if (meridiem === 'م' || meridiem === 'pm') hour += 12;
  } else if (hour > 23) {
    return digits;
  }

  return [hour, minute, second].map((part) => String(part).padStart(2, '0')).join(':');
}
