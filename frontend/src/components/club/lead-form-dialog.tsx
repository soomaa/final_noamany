import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { LeadHistory } from '@/pages/mos/lead-history';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SelectField } from '@/components/common/select-field';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { useKnowledgeSources } from '@/lib/use-knowledge-sources';
import { editableLeadStatuses } from '@/pages/mos/lead-conversion';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { isMaskedValue, isPristineMaskedValue } from '@/lib/masked-value';

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  assignedTo: string;
  sourceId: string;
  status: string;
  followUpAt: string;
  notes: string;
  /** EMS scopes every lead to a branch; FIT90's single-branch form had no such field. */
  branchId: string;
}

export const EMPTY_LEAD_FORM: LeadFormValues = {
  name: '',
  phone: '',
  email: '',
  assignedTo: '',
  sourceId: '',
  status: 'new',
  followUpAt: '',
  notes: '',
  branchId: '',
};

/** The statuses a person may set by hand; `converted` belongs to the conversion flow. */
const PIPELINE = [
  { key: 'new', ar: 'جديد', en: 'New' },
  { key: 'contacted', ar: 'تم التواصل', en: 'Contacted' },
  { key: 'no_answer', ar: 'لم يرد', en: 'No answer' },
  { key: 'unreachable', ar: 'تعذّر الوصول', en: 'Unreachable' },
  { key: 'follow_up', ar: 'متابعة', en: 'Follow up' },
  { key: 'visit_arranged', ar: 'زيارة محددة', en: 'Visit arranged' },
  { key: 'qualified', ar: 'مؤهل', en: 'Qualified' },
  { key: 'membership_done', ar: 'تم الاشتراك', en: 'Membership done' },
  { key: 'converted', ar: 'تم التحويل', en: 'Converted' },
  { key: 'lost', ar: 'غير مهتم', en: 'Not interested' },
];

/**
 * The one potential-member form. Both the Potential Members screen and the sales
 * workspace mount this, so a client entered from either side is the same record with
 * the same rules — and a rep's own entry stays theirs, because the server pins
 * `assignedTo` to whoever created it.
 */
export function LeadFormDialog({
  open,
  onOpenChange,
  editId = null,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId?: number | null;
  initial?: Partial<LeadFormValues>;
  onSaved?: () => void | Promise<void>;
}) {
  const ct = useClubT();
  const { isRtl } = useLocale();
  const { user } = useAuth();
  const qc = useQueryClient();
  const lockSalesRep = Boolean(user?.isSalesRep);
  const selfEmployeeId = user?.employeeId ?? user?.emp_code ?? undefined;

  const [form, setForm] = useState<LeadFormValues>({ ...EMPTY_LEAD_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  // Re-seed whenever the dialog opens on a different record.
  const [seed, setSeed] = useState<string>('');
  const nextSeed = `${editId ?? 'new'}:${open}`;
  if (seed !== nextSeed) {
    setSeed(nextSeed);
    if (open) {
      setForm({
        ...EMPTY_LEAD_FORM,
        // Show the rep their own name instead of "—"; the server sets this regardless.
        assignedTo: lockSalesRep && selfEmployeeId ? String(selfEmployeeId) : '',
        branchId: user?.branch ? String(user.branch) : '',
        ...initial,
      });
    }
  }

  const { data: salesReps } = useQuery({
    queryKey: ['employees', 'sales-reps'],
    queryFn: async () =>
      (await api.get<Array<{ id: number; name: string | null }>>('/employees/sales-reps')).data,
  });
  const knowledgeSources = useKnowledgeSources();
  const { data: branches } = useBranches();
  const branchId = form.branchId || (branches?.length === 1 ? String(branches[0]!.id) : '');

  const save = async () => {
    // EMS matches leads by phone (duplicates, renewals), so unlike FIT90 it is required.
    if (!form.name.trim() || form.phone.trim().length < 6 || !branchId) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    // An untouched masked number is kept as stored; half-edited stars cannot be saved.
    if (isMaskedValue(form.phone) && !isPristineMaskedValue(form.phone)) {
      toast.error(isRtl ? 'الرقم ظاهر مخفيًا — امسحه واكتب الرقم الجديد كاملًا' : 'The number is shown masked — clear it and type the new number in full');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fullName: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || (editId ? null : undefined),
        assignedToId: form.assignedTo ? Number(form.assignedTo) : null,
        sourceId: form.sourceId ? Number(form.sourceId) : null,
        // A lead always enters the funnel as new; its status is edited afterwards.
        ...(editId ? { status: form.status } : {}),
        followUpAt: form.followUpAt || null,
        notes: form.notes,
        branchId: Number(branchId),
      };
      if (editId) await api.put(`/club-leads/${editId}`, payload);
      else await api.post('/club-leads', payload);
      // The new client has to show up in both screens without a reload.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['club-leads'] }),
        qc.invalidateQueries({ queryKey: ['club-leads-mine'] }),
        qc.invalidateQueries({ queryKey: ['sales-portal'] }),
      ]);
      await onSaved?.();
      onOpenChange(false);
      toast.success(ct('common.saved'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editId ? ct('common.edit') : ct('common.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="leadFormName">{ct('common.name')} *</Label>
            <Input
              id="leadFormName"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="leadFormPhone">{ct('common.phone')} *</Label>
              <Input
                id="leadFormPhone"
                dir="ltr"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="leadFormEmail">{ct('mos.email')}</Label>
              <Input
                id="leadFormEmail"
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="leadFormRep">{ct('mos.salesEmployee')}</Label>
              {/* Sales reps own the leads they enter — the server forces this value,
                  so the field is read-only rather than a choice that gets overridden. */}
              <SelectField
                id="leadFormRep"
                value={form.assignedTo}
                disabled={lockSalesRep}
                onChange={(value) => setForm((f) => ({ ...f, assignedTo: value }))}
              >
                <option value="">—</option>
                {(salesReps ?? []).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name ?? `#${employee.id}`}</option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="leadFormSource">{ct('mos.knowledgeSource')}</Label>
              <SelectField
                id="leadFormSource"
                value={form.sourceId}
                onChange={(value) => setForm((f) => ({ ...f, sourceId: value }))}
              >
                <option value="">—</option>
                {knowledgeSources.map((source) => (
                  <option key={source.id} value={source.id}>{source.name}</option>
                ))}
              </SelectField>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {editId ? (
              <div className="grid gap-2">
                <Label htmlFor="leadFormStatus">{ct('common.status')}</Label>
                <SelectField
                  id="leadFormStatus"
                  value={form.status}
                  onChange={(value) => setForm((f) => ({ ...f, status: value }))}
                >
                  {editableLeadStatuses(PIPELINE).map((p) => (
                    <option key={p.key} value={p.key}>{isRtl ? p.ar : p.en}</option>
                  ))}
                </SelectField>
              </div>
            ) : (branches?.length ?? 0) > 1 ? (
              <div className="grid gap-2">
                <Label htmlFor="leadFormBranch">{isRtl ? 'الفرع *' : 'Branch *'}</Label>
                <SelectField
                  id="leadFormBranch"
                  value={branchId}
                  onChange={(value) => setForm((f) => ({ ...f, branchId: value }))}
                >
                  <option value="">—</option>
                  {(branches ?? []).map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name ?? `#${branch.id}`}</option>
                  ))}
                </SelectField>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="leadFormFollowUp">{ct('mos.followUp')}</Label>
              <Input
                id="leadFormFollowUp"
                type="date"
                value={form.followUpAt}
                onChange={(e) => setForm((f) => ({ ...f, followUpAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="leadFormNotes">{ct('common.notes')}</Label>
            <Textarea
              id="leadFormNotes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
            />
          </div>
          {/* Comments post immediately and are only available on a saved lead. */}
          {editId != null && <LeadHistory leadId={editId} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ct('common.cancel')}</Button>
          <Button variant="brand" disabled={saving} onClick={() => void save()}>
            {saving ? ct('common.saving') : ct('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
