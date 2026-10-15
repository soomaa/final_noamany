import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/store/locale';

interface NameDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  initial?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

/** Tiny single-field prompt dialog used for create / rename / clone role flows. */
export function NameDialog({
  open,
  title,
  description,
  label,
  initial = '',
  confirmLabel,
  onSubmit,
  onClose,
}: NameDialogProps) {
  const { ui } = useLocale();
  const resolvedLabel = label ?? ui('الاسم');
  const resolvedConfirm = confirmLabel ?? ui('حفظ');
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim();
            if (v) onSubmit(v);
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name-dialog-input">{resolvedLabel}</Label>
            <Input
              id="name-dialog-input"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {ui('إلغاء')}
            </Button>
            <Button type="submit" variant="brand" disabled={!value.trim()}>
              {resolvedConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
