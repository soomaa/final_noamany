export const trainerPortalSections = ['clients', 'calendar', 'attendance', 'private', 'earnings'] as const;
export type TrainerPortalSection = (typeof trainerPortalSections)[number];

export function resolveTrainerPortalSection(value: string | null | undefined): TrainerPortalSection {
  return trainerPortalSections.includes(value as TrainerPortalSection)
    ? value as TrainerPortalSection
    : 'clients';
}

export function monthRange(anchor: string) {
  const match = /^(\d{4})-(\d{2})/.exec(anchor);
  if (!match) throw new Error('Invalid month anchor');
  const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return { dateFrom: `${match[1]}-${match[2]}-01`, dateTo: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}` };
}

export function shiftPortalMonth(anchor: string, offset: number) {
  const match = /^(\d{4})-(\d{2})/.exec(anchor);
  if (!match) throw new Error('Invalid month anchor');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function trainerClassStatusLabel(status: string) {
  return ({ scheduled: 'مجدولة', ongoing: 'جارية', completed: 'مكتملة', cancelled: 'ملغاة' } as Record<string, string>)[status] ?? status;
}
