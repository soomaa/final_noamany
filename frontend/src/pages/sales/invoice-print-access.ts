export function canPrintViewedInvoice(can: (key: string) => boolean): boolean {
  return can('gym-sales.sales.drafts:view')
    || can('gym-sales.sales.drafts:print')
    || can('gym-sales.sales.new_receipt:print');
}

export function isInvoicePrintBlocked({
  printing,
}: {
  printing: boolean;
  settingsReady: boolean;
  templatesReady: boolean;
}): boolean {
  // Manual printing has complete local defaults. Remote preferences improve the
  // receipt, but a slow or unavailable settings endpoint must not disable it.
  return printing;
}
