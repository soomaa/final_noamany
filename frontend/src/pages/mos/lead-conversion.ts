export function canConvertLead(lead: { phone?: string | null; status?: string | null }): boolean {
  return Boolean(lead.phone?.trim()) && lead.status !== 'converted';
}

export function canEditLead(lead: { status?: string | null }): boolean {
  return lead.status !== 'converted';
}

export function editableLeadStatuses<T extends { key: string }>(statuses: readonly T[]): T[] {
  return statuses.filter((status) => status.key !== 'converted');
}
