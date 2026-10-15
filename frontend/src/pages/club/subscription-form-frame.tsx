import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FormDialogHeader, FORM_DIALOG_CONTENT_CLASS } from '@/components/common/dialog-form-layout';

/** The same subscription fields serve the dedicated creation page and list dialogs. */
export function SubscriptionFormFrame({ inline, open, onOpenChange, title, children }: {
  inline: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  if (inline) return <section aria-label={title} className="mx-auto w-full max-w-5xl overflow-hidden rounded-xl border bg-card text-card-foreground">{children}</section>;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}>
      <FormDialogHeader><DialogTitle>{title}</DialogTitle></FormDialogHeader>
      {children}
    </DialogContent>
  </Dialog>;
}
