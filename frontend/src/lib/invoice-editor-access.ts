/** Editing an existing invoice is owned by the shift-invoice page, not sale creation. */
export function canOpenCompletedInvoiceEditor(
  pathname: string,
  search: string,
  can: (key: string) => boolean,
): boolean {
  if (pathname !== '/sales/new') return false;
  const query = new URLSearchParams(search);
  const ids = query.getAll('editId');
  if (query.has('draftId') || ids.length !== 1 || !/^[1-9]\d*$/.test(ids[0])) return false;
  if (!Number.isSafeInteger(Number(ids[0]))) return false;
  return can('gym-sales.sales.drafts:view') && can('gym-sales.sales.drafts:update');
}
