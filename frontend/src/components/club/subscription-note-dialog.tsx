import { formatDisplayNumber } from '@/lib/number-display';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import type { ClubSubscriptionListItem } from '@/types/club';

const MAX_NOTE_LENGTH = 2000;

/** Add or edit the member-visible note (no money or date change). */
export function SubscriptionNoteDialog({
  subscription,
  permissionResource = 'club.subscriptions.list',
  onOpenChange,
  onSaved,
}: {
  subscription: Pick<ClubSubscriptionListItem, 'id' | 'subscriptionNumber' | 'customerName' | 'notes'> | null;
  permissionResource?: 'club.subscriptions.list' | 'club.reception';
  onOpenChange: (open: boolean) => void;
  onSaved: (subscription: ClubSubscriptionListItem) => void;
}) {
  const ct = useClubT();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(subscription?.notes ?? '');
  }, [subscription]);

  const save = async () => {
    if (!subscription) return;
    setSaving(true);
    try {
      const { data } = await api.patch<ClubSubscriptionListItem>(
        `/club-subscriptions/${subscription.id}/notes`,
        { notes: note.trim() || null },
      );
      toast.success(ct('subscriptions.noteSaved'));
      onSaved(data);
      onOpenChange(false);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!subscription} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{ct('subscriptions.noteTitle')}</DialogTitle>
          {subscription ? (
            <DialogDescription>
              <span className="nums">{subscription.subscriptionNumber}</span>
              {subscription.customerName ? ` — ${subscription.customerName}` : ''}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <Textarea
          rows={6}
          maxLength={MAX_NOTE_LENGTH}
          value={note}
          placeholder={ct('subscriptions.notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
          disabled={saving}
          autoFocus
        />
        <p className="text-end text-xs text-muted-foreground nums">
          {formatDisplayNumber(note.length)} / {formatDisplayNumber(MAX_NOTE_LENGTH)}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {ct('common.cancel')}
          </Button>
          <Button
            variant="brand"
            permissionResource={permissionResource}
            permissionAction="update"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? ct('common.saving') : ct('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
