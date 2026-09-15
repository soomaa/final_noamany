import type { ColumnDef } from '@tanstack/react-table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { Badge } from '@/components/ui/badge';
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
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';
import { AppManagementShell } from './app-shell';

type CommunityStatus = 'pending' | 'approved' | 'rejected';
type CommunityCategory = 'question' | 'experience' | 'discussion';

interface CommunityPostRow {
  id: number;
  member: { id: number; name: string; profilePictureUrl: string | null };
  category: CommunityCategory;
  title: string;
  description: string;
  status: CommunityStatus;
  adminReply: string | null;
  rejectionReason: string | null;
  repliedAt: string | null;
  likesCount: number;
  lovedItCount: number;
  createdAt: string;
}

const CATEGORY_LABELS: Record<CommunityCategory, string> = {
  question: 'سؤال',
  experience: 'تجربة',
  discussion: 'نقاش',
};

const STATUS_LABELS: Record<CommunityStatus, string> = {
  pending: 'قيد المراجعة',
  approved: 'مقبول',
  rejected: 'مرفوض',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-EG');
}

function StatusBadge({ status }: { status: CommunityStatus }) {
  const { ui } = useLocale();
  const variant = status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning';
  return <Badge variant={variant}>{ui(STATUS_LABELS[status])}</Badge>;
}

export function AppCommunityPage() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<CommunityPostRow>('app/community/posts', params);
  const [detailsFor, setDetailsFor] = useState<CommunityPostRow | null>(null);
  const [approving, setApproving] = useState<CommunityPostRow | null>(null);
  const [adminReply, setAdminReply] = useState('');
  const [rejecting, setRejecting] = useState<CommunityPostRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const refreshPosts = () => {
    void queryClient.invalidateQueries({ queryKey: ['app/community/posts'] });
    void refetch();
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, reply }: { id: number; reply: string }) => api.post(`/app/community/posts/${id}/approve`, { adminReply: reply }),
    onSuccess: () => {
      toast.success(ui('تم اعتماد المنشور'));
      setApproving(null);
      setAdminReply('');
      refreshPosts();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => api.post(`/app/community/posts/${id}/reject`, reason ? { rejectionReason: reason } : {}),
    onSuccess: () => {
      toast.success(ui('تم رفض المنشور'));
      setRejecting(null);
      setRejectionReason('');
      refreshPosts();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const mutationPending = approveMutation.isPending || rejectMutation.isPending;
  const columns = useMemo<ColumnDef<CommunityPostRow>[]>(
    () => [
      { accessorKey: 'id', header: ui('المعرف'), cell: ({ getValue }) => <span className="nums">{String(getValue())}</span> },
      { accessorKey: 'member', header: ui('العضو'), cell: ({ row }) => row.original.member.name },
      { accessorKey: 'category', header: ui('الفئة'), cell: ({ getValue }) => ui(CATEGORY_LABELS[getValue() as CommunityCategory]) },
      { accessorKey: 'title', header: ui('العنوان'), cell: ({ getValue }) => <span className="max-w-48 truncate block">{String(getValue())}</span> },
      { accessorKey: 'description', header: ui('الوصف'), cell: ({ getValue }) => <span className="max-w-64 truncate block">{String(getValue())}</span> },
      { accessorKey: 'createdAt', header: ui('تاريخ الإنشاء'), cell: ({ getValue }) => formatDate(getValue() as string) },
      { accessorKey: 'status', header: ui('الحالة'), cell: ({ getValue }) => <StatusBadge status={getValue() as CommunityStatus} /> },
      { accessorKey: 'likesCount', header: ui('إعجاب'), cell: ({ getValue }) => <span className="nums">{String(getValue())}</span> },
      { accessorKey: 'lovedItCount', header: ui('أحببته'), cell: ({ getValue }) => <span className="nums">{String(getValue())}</span> },
      {
        id: 'actions',
        header: ui('إجراءات'),
        cell: ({ row }) => {
          const post = row.original;
          return (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" title={ui('عرض التفاصيل')} onClick={() => setDetailsFor(post)}>
                <Eye className="size-4" />
                <span className="sr-only">{ui('عرض التفاصيل')}</span>
              </Button>
              {post.status === 'pending' && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={ui('اعتماد')}
                    disabled={mutationPending}
                    onClick={() => {
                      setAdminReply('');
                      setApproving(post);
                    }}
                  >
                    <Check className="size-4 text-success" />
                    <span className="sr-only">{ui('اعتماد')}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={ui('رفض')}
                    disabled={mutationPending}
                    onClick={() => {
                      setRejectionReason('');
                      setRejecting(post);
                    }}
                  >
                    <X className="size-4 text-destructive" />
                    <span className="sr-only">{ui('رفض')}</span>
                  </Button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [mutationPending, ui],
  );

  const submitApproval = () => {
    const reply = adminReply.trim();
    if (!approving || !reply) return;
    approveMutation.mutate({ id: approving.id, reply });
  };

  const submitRejection = async () => {
    if (!rejecting) return;
    const accepted = await confirm({
      title: ui('تأكيد رفض المنشور؟'),
      description: ui('لن يظهر المنشور للأعضاء بعد رفضه.'),
      confirmLabel: ui('رفض'),
      variant: 'destructive',
    });
    if (accepted) rejectMutation.mutate({ id: rejecting.id, reason: rejectionReason.trim() || undefined });
  };

  return (
    <AppManagementShell title={ui('إدارة المجتمع')} description={ui('مراجعة واعتماد منشورات مجتمع التطبيق')}>
      <FilterBar
        searchPlaceholder={ui('ابحث في منشورات المجتمع…')}
        fields={[
          {
            key: 'category',
            label: ui('الفئة'),
            type: 'select',
            options: (Object.keys(CATEGORY_LABELS) as CommunityCategory[]).map((value) => ({ value, label: ui(CATEGORY_LABELS[value]) })),
          },
          {
            key: 'status',
            label: ui('الحالة'),
            type: 'select',
            options: (Object.keys(STATUS_LABELS) as CommunityStatus[]).map((value) => ({ value, label: ui(STATUS_LABELS[value]) })),
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        enableExport={false}
      />

      <Dialog open={detailsFor != null} onOpenChange={(open) => !open && setDetailsFor(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{ui('تفاصيل المنشور')}</DialogTitle>
            <DialogDescription>{detailsFor ? ui(`المنشور رقم ${detailsFor.id}`) : ''}</DialogDescription>
          </DialogHeader>
          {detailsFor && (
            <div className="grid gap-4 text-sm">
              <div className="grid gap-1 sm:grid-cols-2 sm:gap-4"><span><strong>{ui('العضو')}:</strong> {detailsFor.member.name}</span><span><strong>{ui('الفئة')}:</strong> {ui(CATEGORY_LABELS[detailsFor.category])}</span></div>
              <div className="grid gap-1"><strong>{ui('العنوان')}</strong><p>{detailsFor.title}</p></div>
              <div className="grid gap-1"><strong>{ui('الوصف')}</strong><p className="whitespace-pre-wrap">{detailsFor.description}</p></div>
              <div className="grid gap-1 sm:grid-cols-2 sm:gap-4"><span><strong>{ui('تاريخ الإنشاء')}:</strong> {formatDate(detailsFor.createdAt)}</span><span><strong>{ui('الحالة')}:</strong> <StatusBadge status={detailsFor.status} /></span></div>
              <div className="grid gap-1 sm:grid-cols-2 sm:gap-4"><span><strong>{ui('إعجاب')}:</strong> {detailsFor.likesCount}</span><span><strong>{ui('أحببته')}:</strong> {detailsFor.lovedItCount}</span></div>
              <div className="grid gap-1"><strong>{ui('رد الإدارة')}</strong><p className="whitespace-pre-wrap">{detailsFor.adminReply || '—'}</p></div>
              <div className="grid gap-1"><strong>{ui('سبب الرفض')}</strong><p className="whitespace-pre-wrap">{detailsFor.rejectionReason || '—'}</p></div>
              <div><strong>{ui('تاريخ الرد')}:</strong> {formatDate(detailsFor.repliedAt)}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={approving != null} onOpenChange={(open) => !open && !approveMutation.isPending && setApproving(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{ui('اعتماد المنشور')}</DialogTitle>
            <DialogDescription>{ui('أضف رد الإدارة المطلوب قبل اعتماد المنشور.')}</DialogDescription>
          </DialogHeader>
          <Textarea value={adminReply} onChange={(event) => setAdminReply(event.target.value)} placeholder={ui('رد الإدارة')} disabled={approveMutation.isPending} />
          <DialogFooter>
            <Button variant="outline" disabled={approveMutation.isPending} onClick={() => setApproving(null)}>{ui('إلغاء')}</Button>
            <Button variant="brand" disabled={approveMutation.isPending || !adminReply.trim()} onClick={submitApproval}>{ui('اعتماد')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting != null} onOpenChange={(open) => !open && !rejectMutation.isPending && setRejecting(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{ui('رفض المنشور')}</DialogTitle>
            <DialogDescription>{ui('يمكن إضافة سبب اختياري للرفض قبل التأكيد.')}</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder={ui('سبب الرفض (اختياري)')} disabled={rejectMutation.isPending} />
          <DialogFooter>
            <Button variant="outline" disabled={rejectMutation.isPending} onClick={() => setRejecting(null)}>{ui('إلغاء')}</Button>
            <Button variant="destructive" disabled={rejectMutation.isPending} onClick={() => void submitRejection()}>{ui('رفض')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppManagementShell>
  );
}
