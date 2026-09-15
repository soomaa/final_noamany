import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Pencil, Plus, Trash2, Upload, Users } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface AgentRow {
  id: number;
  name?: string | null;
  image?: string | null;
  mob?: string | null;
  email?: string | null;
  officeNo?: string | null;
  activity?: string | null;
  createdAt?: string | null;
}

interface AgentDetail extends AgentRow {
  nameSlug?: string | null;
  gender?: string | null;
  mob2?: string | null;
  mob3?: string | null;
  mob4?: string | null;
  fax?: string | null;
  privateEmail?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  instgram?: string | null;
  linkedin?: string | null;
  address?: string | null;
  description?: string | null;
  viewDetails?: string | null;
  haveAccount?: number | null;
  updatedAt?: string | null;
}

const GENDER_OPTIONS = [
  { value: 'male', label: uiStatic('ذكر') },
  { value: 'female', label: uiStatic('أنثى') },
];

const ACTIVITY_OPTIONS = [
  { value: 'active', label: uiStatic('نشط') },
  { value: 'notactive', label: uiStatic('غير نشط') },
];

const VIEW_DETAILS_OPTIONS = [
  { value: 'yes', label: uiStatic('نعم') },
  { value: 'no', label: uiStatic('لا') },
];

/** Resolve a stored upload path to its public URL (legacy /uploads mount). */
function imageUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `/uploads/${path}`;
}

const EMPTY_FORM = {
  name: '',
  gender: 'male',
  image: '',
  officeNo: '',
  mob: '',
  mob2: '',
  mob3: '',
  mob4: '',
  fax: '',
  email: '',
  privateEmail: '',
  facebook: '',
  twitter: '',
  instgram: '',
  linkedin: '',
  address: '',
  description: '',
  activity: 'active',
  viewDetails: 'no',
};

export function AgentsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<AgentRow>('agents', params);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/agents/${id}`),
    { success: ui('تم حذف الوكيل'), invalidate: ['agents'] },
  );

  const stats = useMemo(
    () => [{ title: ui('الوكلاء'), value: toArabicDigits(data?.total ?? 0), icon: <Users className="size-5" /> }],
    [data],
  );

  const activityFilter = params.filters.activity ?? '';

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setFormOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const { data: a } = await api.get<AgentDetail>(`/agents/${id}`);
      setEditId(id);
      setForm({
        name: a.name ?? '',
        gender: a.gender ?? 'male',
        image: a.image ?? '',
        officeNo: a.officeNo ?? '',
        mob: a.mob ?? '',
        mob2: a.mob2 ?? '',
        mob3: a.mob3 ?? '',
        mob4: a.mob4 ?? '',
        fax: a.fax ?? '',
        email: a.email ?? '',
        privateEmail: a.privateEmail ?? '',
        facebook: a.facebook ?? '',
        twitter: a.twitter ?? '',
        instgram: a.instgram ?? '',
        linkedin: a.linkedin ?? '',
        address: a.address ?? '',
        description: a.description ?? '',
        activity: a.activity ?? 'active',
        viewDetails: a.viewDetails ?? 'no',
      });
      setFormOpen(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openDetail = async (id: number) => {
    try {
      const { data: a } = await api.get<AgentDetail>(`/agents/${id}`);
      setDetail(a);
      setDetailOpen(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const { data: res } = await api.post<{ path: string }>('/uploads/agent', payload);
      setForm((f) => ({ ...f, image: res.path }));
      toast.success(ui('تم رفع الصورة'));
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(ui('اسم الوكيل مطلوب'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        gender: form.gender || undefined,
        image: form.image || undefined,
        officeNo: form.officeNo || undefined,
        mob: form.mob || undefined,
        mob2: form.mob2 || undefined,
        mob3: form.mob3 || undefined,
        mob4: form.mob4 || undefined,
        fax: form.fax || undefined,
        email: form.email || undefined,
        privateEmail: form.privateEmail || undefined,
        facebook: form.facebook || undefined,
        twitter: form.twitter || undefined,
        instgram: form.instgram || undefined,
        linkedin: form.linkedin || undefined,
        address: form.address || undefined,
        description: form.description || undefined,
        activity: form.activity || undefined,
        viewDetails: form.viewDetails || undefined,
      };
      if (editId) await api.patch(`/agents/${editId}`, payload);
      else await api.post('/agents', payload);
      toast.success(ui('تم حفظ الوكيل'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<AgentRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      id: 'agent',
      header: ui('الوكيل'),
      cell: ({ row }) => {
        const a = row.original;
        return (
          <button
            type="button"
            className="flex items-center gap-2 text-end hover:underline"
            onClick={() => void openDetail(a.id)}
          >
            <Avatar className="size-8">
              {a.image && <AvatarImage src={imageUrl(a.image)} alt={a.name ?? ''} />}
              <AvatarFallback>{(a.name ?? '?').slice(0, 1)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{a.name ?? '—'}</span>
          </button>
        );
      },
    },
    {
      accessorKey: 'mob',
      header: ui('الجوال'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return <span className="nums">{v ? toArabicDigits(v) : '—'}</span>;
      },
    },
    {
      accessorKey: 'email',
      header: ui('البريد الإلكتروني'),
      cell: ({ getValue }) => (getValue() as string | null) || '—',
    },
    {
      accessorKey: 'createdAt',
      header: ui('تاريخ الإضافة'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'activity',
      header: ui('النشاط'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return (
          <StatusBadge
            status={v === 'active' ? 'active' : 'suspended'}
            label={v === 'active' ? ui('نشط') : ui('غير نشط')}
          />
        );
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('عرض')}
            onClick={() => void openDetail(row.original.id)}
          >
            <ExternalLink className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('تعديل')}
            onClick={() => void openEdit(row.original.id)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف الوكيل'),
                description: ui('هل تريد حذف هذا الوكيل؟'),
                confirmLabel: ui('حذف'),
                variant: 'destructive',
              });
              if (ok) deleteMutation.mutate(row.original.id);
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('الوكلاء')}
        description={ui('دليل الوكلاء وبيانات التواصل')}
        searchPlaceholder={ui('بحث بالاسم أو الجوال أو البريد…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <div className="flex items-center gap-2">
            <Combobox
              value={activityFilter}
              onValueChange={(activity) => setParams({ filters: { activity }, page: 1 })}
              options={ACTIVITY_OPTIONS}
              placeholder={ui('كل النشاط')}
              aria-label={ui('تصفية حسب النشاط')}
              className="w-40"
            />
            <Button variant="brand" size="sm" onClick={openCreate}>
              <Plus className="size-4" /> {ui('وكيل جديد')}
            </Button>
          </div>
        }
      >
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          total={data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          search={params.search}
          onSearchChange={(s) => setParams({ search: s, page: 1 })}
          emptyTitle={ui('لا يوجد وكلاء')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل وكيل') : ui('وكيل جديد')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto ps-1">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                {form.image && <AvatarImage src={imageUrl(form.image)} alt="" />}
                <AvatarFallback>{(form.name || '?').slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickImage(e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" /> {uploading ? ui('جارٍ الرفع…') : ui('رفع صورة')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="agent-name">{ui('الاسم')}</Label>
                <Input id="agent-name" className="mt-1.5" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>{ui('النوع')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.gender}
                    onValueChange={(gender) => setForm((f) => ({ ...f, gender }))}
                    options={GENDER_OPTIONS}
                    placeholder={ui('النوع…')}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="agent-mob">{ui('الجوال')}</Label>
                <Input id="agent-mob" className="mt-1.5 nums" value={form.mob} onChange={(e) => setForm((f) => ({ ...f, mob: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="agent-office">{ui('هاتف المكتب')}</Label>
                <Input id="agent-office" className="mt-1.5 nums" value={form.officeNo} onChange={(e) => setForm((f) => ({ ...f, officeNo: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="agent-mob2">{ui('جوال ٢')}</Label>
                <Input id="agent-mob2" className="mt-1.5 nums" value={form.mob2} onChange={(e) => setForm((f) => ({ ...f, mob2: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="agent-mob3">{ui('جوال ٣')}</Label>
                <Input id="agent-mob3" className="mt-1.5 nums" value={form.mob3} onChange={(e) => setForm((f) => ({ ...f, mob3: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="agent-mob4">{ui('جوال ٤')}</Label>
                <Input id="agent-mob4" className="mt-1.5 nums" value={form.mob4} onChange={(e) => setForm((f) => ({ ...f, mob4: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="agent-fax">{ui('الفاكس')}</Label>
                <Input id="agent-fax" className="mt-1.5 nums" value={form.fax} onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="agent-email">{ui('البريد الإلكتروني')}</Label>
                <Input id="agent-email" type="email" className="mt-1.5" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label htmlFor="agent-private-email">{ui('البريد الخاص')}</Label>
              <Input id="agent-private-email" type="email" className="mt-1.5" value={form.privateEmail} onChange={(e) => setForm((f) => ({ ...f, privateEmail: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="agent-facebook">{ui('فيسبوك')}</Label>
                <Input id="agent-facebook" className="mt-1.5" value={form.facebook} onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="agent-twitter">{ui('تويتر')}</Label>
                <Input id="agent-twitter" className="mt-1.5" value={form.twitter} onChange={(e) => setForm((f) => ({ ...f, twitter: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="agent-instgram">{ui('انستجرام')}</Label>
                <Input id="agent-instgram" className="mt-1.5" value={form.instgram} onChange={(e) => setForm((f) => ({ ...f, instgram: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="agent-linkedin">{ui('لينكدإن')}</Label>
                <Input id="agent-linkedin" className="mt-1.5" value={form.linkedin} onChange={(e) => setForm((f) => ({ ...f, linkedin: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label htmlFor="agent-address">{ui('العنوان')}</Label>
              <Input id="agent-address" className="mt-1.5" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>

            <div>
              <Label htmlFor="agent-description">{ui('الوصف')}</Label>
              <Textarea id="agent-description" className="mt-1.5" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{ui('النشاط')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.activity}
                    onValueChange={(activity) => setForm((f) => ({ ...f, activity }))}
                    options={ACTIVITY_OPTIONS}
                    placeholder={ui('النشاط…')}
                  />
                </div>
              </div>
              <div>
                <Label>{ui('عرض التفاصيل')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.viewDetails}
                    onValueChange={(viewDetails) => setForm((f) => ({ ...f, viewDetails }))}
                    options={VIEW_DETAILS_OPTIONS}
                    placeholder={ui('عرض التفاصيل…')}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()} disabled={saving || uploading}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{ui('ملف الوكيل')}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  {detail.image && <AvatarImage src={imageUrl(detail.image)} alt={detail.name ?? ''} />}
                  <AvatarFallback>{(detail.name ?? '?').slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-lg font-semibold">{detail.name ?? '—'}</div>
                  <StatusBadge
                    status={detail.activity === 'active' ? 'active' : 'suspended'}
                    label={detail.activity === 'active' ? ui('نشط') : ui('غير نشط')}
                  />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DetailRow label={ui('الجوال')} value={detail.mob} nums />
                <DetailRow label={ui('هاتف المكتب')} value={detail.officeNo} nums />
                <DetailRow label={ui('جوال ٢')} value={detail.mob2} nums />
                <DetailRow label={ui('جوال ٣')} value={detail.mob3} nums />
                <DetailRow label={ui('جوال ٤')} value={detail.mob4} nums />
                <DetailRow label={ui('الفاكس')} value={detail.fax} nums />
                <DetailRow label={ui('البريد الإلكتروني')} value={detail.email} />
                <DetailRow label={ui('البريد الخاص')} value={detail.privateEmail} />
                <DetailRow label={ui('فيسبوك')} value={detail.facebook} />
                <DetailRow label={ui('تويتر')} value={detail.twitter} />
                <DetailRow label={ui('انستجرام')} value={detail.instgram} />
                <DetailRow label={ui('لينكدإن')} value={detail.linkedin} />
                <DetailRow label={ui('العنوان')} value={detail.address} />
              </dl>
              {detail.description && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">{ui('الوصف')}</div>
                  <p className="mt-1 whitespace-pre-line text-sm">{detail.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>{ui('إغلاق')}</Button>
            {detail && (
              <Button
                onClick={() => {
                  setDetailOpen(false);
                  void openEdit(detail.id);
                }}
              >
                {ui('تعديل')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailRow({ label, value, nums }: { label: string; value?: string | null; nums?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={nums && value ? 'nums' : undefined}>
        {value ? (nums ? toArabicDigits(value) : value) : '—'}
      </dd>
    </div>
  );
}
