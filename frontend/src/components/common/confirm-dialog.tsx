import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirmStore } from '@/lib/confirm';
import { useLocale } from '@/store/locale';

export function ConfirmDialogProvider() {
  const { open, options, handleConfirm, handleCancel } = useConfirmStore();
  const { t, ui } = useLocale();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && <DialogDescription>{options.description}</DialogDescription>}
        </DialogHeader>

        {options?.rows && options.rows.length > 0 && (
          <div className="rounded-md border text-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-start font-medium">{t('shared.field') ?? ui('الحقل')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('shared.before') ?? ui('قبل')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('shared.after') ?? ui('بعد')}</th>
                </tr>
              </thead>
              <tbody>
                {options.rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{row.label}</td>
                    <td className="px-3 py-2">{row.before ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">{row.after ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {options?.warning && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {options.warning}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {options?.cancelLabel ?? t('shared.cancel')}
          </Button>
          <Button variant={options?.variant === 'destructive' ? 'destructive' : 'default'} onClick={handleConfirm}>
            {options?.confirmLabel ?? t('shared.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
