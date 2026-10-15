import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, UserCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { clientPaginate } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';
import { invitationLeadPresentation } from '@/lib/guest-invitation-model';
import { Badge } from '@/components/ui/badge';
import { indexColumn } from '../inventory/simple-crud-tab';
import { AppManagementShell } from './app-shell';
import { uiStatic } from '@/lib/ui-static';

export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'attended';

interface InvitationRow {
  id: number;
  invitationCode: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string | null;
  status: InvitationStatus;
  branchName: string | null;
  sentDate: string;
  acceptedDate: string | null;
  rejectedDate: string | null;
  attendanceDate: string | null;
  rejectionReason: string | null;
  /** Sales lead captured from this invitation; null when it had no phone or branch. */
  leadId: number | null;
  leadStatus: string | null;
}

const STATUS_META: Record<
  InvitationStatus,
  { title: string; description: string; fixedStatus?: InvitationStatus }
> = {
  pending: { title: uiStatic('الدعوات المرسلة'), description: uiStatic('دعوات بانتظار الرد'), fixedStatus: 'pending' },
  accepted: { title: uiStatic('الدعوات المقبولة'), description: uiStatic('دعوات قبلتها الإدارة'), fixedStatus: 'accepted' },
  attended: { title: uiStatic('الدعوات المسجلة حضور'), description: uiStatic('دعوات سُجّل حضورها بالفرع'), fixedStatus: 'attended' },
  rejected: { title: uiStatic('الدعوات المرفوضة'), description: uiStatic('دعوات مرفوضة'), fixedStatus: 'rejected' },
};

function InvitationsPageInner({ statusKey }: { statusKey: InvitationStatus }) {
  const meta = STATUS_META[statusKey];
  const { ui } = useLocale();
  const { can } = usePermission();
  const permissionResource = `app-management.invitations.${statusKey === 'pending' ? 'sent' : statusKey}`;
  const canCreate = statusKey === 'pending' && can('app-management.invitations.sent:create');
  const canUpdate = can(`${permissionResource}:update`);
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ recipientName: '', recipientEmail: '', recipientPhone: '', branchId: '' });
  const [saving, setSaving] = useState(false);
  // Tracks the invitation id being accepted/rejected/attended so the row action can't be double-clicked.
  const [actingId, setActingId] = useState<number | null>(null);

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['app', 'invitations', statusKey],
    queryFn: async () => {
      const { data: d } = await api.get<InvitationRow[]>(`/app/invitations/status/${statusKey}`);
      return d;
    },
  });

  const paged = clientPaginate(rows, params, {
    search: (item, q) =>
      item.recipientName.toLowerCase().includes(q) ||
      item.recipientEmail.toLowerCase().includes(q) ||
      (item.recipientPhone ?? '').includes(q) ||
      item.invitationCode.toLowerCase().includes(q),
  });

  async function updateStatus(id: number, status: InvitationStatus, rejectionReason?: string) {
    if (!canUpdate || actingId != null) return;
    setActingId(id);
    try {
      await api.put(`/app/invitations/${id}`, {
        status,
        ...(rejectionReason ? { rejectionReason } : {}),
      });
      toast.success(uiStatic('تم تحديث الدعوة'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActingId(null);
    }
  }

  const columns = useMemo<ColumnDef<InvitationRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<InvitationRow>,
      { accessorKey: 'invitationCode', header: uiStatic('الرمز'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
      { accessorKey: 'recipientName', header: uiStatic('الاسم') },
      { accessorKey: 'recipientEmail', header: uiStatic('البريد') },
      {
        accessorKey: 'recipientPhone',
        header: uiStatic('الموبايل'),
        cell: ({ getValue }) => <span className="nums">{(getValue() as string | null) ?? '—'}</span>,
      },
      { accessorKey: 'branchName', header: uiStatic('الفرع'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        id: 'lead',
        header: uiStatic('متابعة المبيعات'),
        cell: ({ row }) => {
          const { leadId, leadStatus } = row.original;
          const presentation = invitationLeadPresentation(leadId ? leadStatus : null);
          return (
            <Badge variant={presentation.tone === 'default' ? 'secondary' : presentation.tone}>
              {uiStatic(presentation.label)}
            </Badge>
          );
        },
      },
      { accessorKey: 'status', header: uiStatic('الحالة') },
      {
        accessorKey: 'sentDate',
        header: uiStatic('تاريخ الإرسال'),
        cell: ({ getValue }) => <span className="nums">{String(getValue()).slice(0, 10)}</span>,
      },
      {
        id: 'actions',
        header: uiStatic('إجراءات'),
        cell: ({ row }) => {
          const item = row.original;
          if (canUpdate && statusKey === 'pending') {
            return (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  title={uiStatic('قبول')}
                  disabled={actingId === item.id}
                  onClick={() => void updateStatus(item.id, 'accepted')}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title={uiStatic('رفض')}
                  disabled={actingId === item.id}
                  onClick={() => {
                    if (actingId != null) return;
                    const reason = window.prompt(uiStatic('سبب الرفض (اختياري)'));
                    if (reason === null) return;
                    void updateStatus(item.id, 'rejected', reason || undefined);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          }
          if (canUpdate && statusKey === 'accepted') {
            return (
              <Button
                size="sm"
                variant="outline"
                disabled={actingId === item.id}
                onClick={() => void updateStatus(item.id, 'attended')}
              >
                <UserCheck className="h-4 w-4" />
                {uiStatic('تسجيل حضور')}
              </Button>
            );
          }
          return null;
        },
      },
    ],
    [actingId, canUpdate, params.page, params.pageSize, statusKey, ui],
  );

  async function createInvitation() {
    if (!canCreate) return;
    setSaving(true);
    try {
      await api.post('/app/invitations', {
        recipientName: form.recipientName,
        ...(form.recipientEmail.trim() ? { recipientEmail: form.recipientEmail.trim() } : {}),
        ...(form.recipientPhone.trim() ? { recipientPhone: form.recipientPhone.trim() } : {}),
        status: 'pending',
        ...(form.branchId ? { branchId: Number(form.branchId) } : {}),
      });
      toast.success(uiStatic('تم إنشاء الدعوة'));
      setOpen(false);
      setForm({ recipientName: '', recipientEmail: '', recipientPhone: '', branchId: '' });
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppManagementShell
      title={meta.title}
      description={meta.description}
      actions={
        canCreate ? (
          <Button variant="brand" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {uiStatic('دعوة جديدة')}
          </Button>
        ) : undefined
      }
    >
      <FilterBar searchPlaceholder={uiStatic('بحث في الدعوات…')} />
      <DataTable
        columns={columns}
        data={paged.data}
        total={paged.total}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <Dialog open={canCreate && open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiStatic('دعوة جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>{uiStatic('اسم المدعو')}</Label>
              <Input value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('البريد الإلكتروني')}</Label>
              <Input type="email" value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('الموبايل')}</Label>
              <Input
                inputMode="tel"
                value={form.recipientPhone}
                onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })}
              />
              {/* Only a phone plus a branch lets the guest be captured as a sales lead. */}
              <p className="text-xs text-muted-foreground">
                {uiStatic('الموبايل والفرع مطلوبان لتسجيل المدعو كعميل محتمل للمتابعة')}
              </p>
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('الفرع')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              >
                <option value="">{uiStatic('— اختياري —')}</option>
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {uiStatic('إلغاء')}
            </Button>
            <Button
              permissionAction="create"
              variant="brand"
              disabled={saving || !form.recipientName.trim() || (!form.recipientEmail.trim() && !form.recipientPhone.trim())}
              onClick={() => void createInvitation()}
            >
              {uiStatic('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppManagementShell>
  );
}

export function SentInvitationsPage() {
  return <InvitationsPageInner statusKey="pending" />;
}
export function AcceptedInvitationsPage() {
  return <InvitationsPageInner statusKey="accepted" />;
}
export function AttendedInvitationsPage() {
  return <InvitationsPageInner statusKey="attended" />;
}
export function RejectedInvitationsPage() {
  return <InvitationsPageInner statusKey="rejected" />;
}
