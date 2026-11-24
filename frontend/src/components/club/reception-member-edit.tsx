import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, FileText, Image as ImageIcon, Loader2, Paperclip, Save, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { memberNotesText } from '@/components/club/reception-member-profile';
import { useFileUpload } from '@/components/employees/use-uploads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { openImagePreview } from '@/components/common/image-preview';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { buildMemberDocumentFormData } from '@/lib/member-document-model';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubMemberAttachment, ClubMemberListItem } from '@/types/club';

/**
 * Pencil/camera button laid over the member photo on the reception screen (client, 24 Nov):
 * picks an image (or the tablet camera), uploads it and saves it on the member at once.
 */
export function ReceptionMemberPhotoEdit({ memberId, onSaved, className }: {
  memberId: number;
  onSaved: () => void;
  className?: string;
}) {
  const { ui } = useLocale();
  const { upload, uploading } = useFileUpload();
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = uploading || saving;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(ui('اختر صورة'));
      return;
    }
    const path = await upload('club-member', file);
    if (!path) return;
    setSaving(true);
    try {
      await api.put(`/club-members/${memberId}`, { profilePicture: path });
      toast.success(ui('تم تغيير صورة العضو'));
      onSaved();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        disabled={busy}
        aria-label={ui('تغيير صورة العضو')}
        title={ui('تغيير صورة العضو')}
        className={cn('size-10 rounded-full border bg-background/90 shadow-md backdrop-blur hover:bg-background', className)}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void pick(file);
        }}
      />
    </>
  );
}

const MARITAL = [
  ['', '—'], ['single', 'أعزب'], ['married', 'متزوج'], ['divorced', 'مطلق'], ['widowed', 'أرمل'],
] as const;

function normalizePhone(phone: string) {
  return phone.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s\-()+]/g, '');
}

function normalizeNationalId(value: string) {
  return value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s+/g, '').toUpperCase();
}

/** Keeps the old-system bookkeeping JSON in `notes` and only replaces the note text inside it. */
function notesPayload(original: string | null | undefined, text: string): string {
  const raw = original?.trim() ?? '';
  if (raw.startsWith('{') && raw.includes('legacy_')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return JSON.stringify({ ...parsed, notes: text || undefined });
    } catch {
      return text;
    }
  }
  return text;
}

function initialForm(member: ClubMemberListItem) {
  return {
    name: member.name ?? '',
    phone: member.phone ?? '',
    cardNumber: member.cardNumber ?? '',
    gender: (member.gender ?? '') as string,
    email: member.email ?? '',
    dateOfBirth: member.dateOfBirth ?? '',
    address: member.address ?? '',
    jobTitle: member.jobTitle ?? '',
    maritalStatus: member.maritalStatus ?? '',
    guardianName: member.guardianName ?? '',
    guardianPhone: member.guardianPhone ?? '',
    notes: memberNotesText(member.notes) ?? '',
  };
}

type Form = ReturnType<typeof initialForm>;

/**
 * The member's data, editable in place from «عرض بيانات العضو وسجلاته» on the reception screen
 * for staff with `club.members:update` (client, 24 Nov). Only the fields that changed are sent.
 */
export function ReceptionMemberEditForm({ member, onSaved, onCancel }: {
  member: ClubMemberListItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { ui } = useLocale();
  const [form, setForm] = useState<Form>(() => initialForm(member));
  const [saving, setSaving] = useState(false);
  const set = (key: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async () => {
    const original = initialForm(member);
    if (!form.name.trim()) return void toast.error(ui('اسم العضو مطلوب'));
    const phone = normalizePhone(form.phone);
    if (!/^\d{11}$/.test(phone)) return void toast.error(ui('رقم الموبايل غير صحيح — يجب أن يكون 11 رقمًا'));
    const cardNumber = normalizeNationalId(form.cardNumber);
    if (cardNumber !== normalizeNationalId(original.cardNumber) && !(/^\d{14}$/.test(cardNumber) || /^\d{14}-C\d{2}$/.test(cardNumber))) {
      return void toast.error(ui('الرقم القومي غير صحيح — يجب أن يكون 14 رقمًا، أو للأطفال: رقم ولي الأمر + كود (مثال: 29801010101234-C01)'));
    }
    if (form.gender !== 'male' && form.gender !== 'female') return void toast.error(ui('اختر النوع'));
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return void toast.error(ui('البريد الإلكتروني غير صحيح'));

    const next: Form = { ...form, phone, cardNumber, name: form.name.trim(), email: form.email.trim() };
    const payload: Record<string, string> = {};
    (Object.keys(next) as Array<keyof Form>).filter((key) => key !== 'dateOfBirth').forEach((key) => {
      const before = key === 'phone' ? normalizePhone(original.phone) : key === 'cardNumber' ? normalizeNationalId(original.cardNumber) : original[key];
      if (next[key].trim() !== before.trim()) payload[key] = key === 'notes' ? notesPayload(member.notes, next.notes.trim()) : next[key].trim();
    });
    if (!Object.keys(payload).length) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      await api.put(`/club-members/${member.id}`, payload);
      toast.success(ui('تم حفظ بيانات العضو'));
      onSaved();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof Form, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`rm-${key}`}>{ui(label)}</Label>
      <Input id={`rm-${key}`} value={form[key]} onChange={set(key)} {...props} />
    </div>
  );
  const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="font-bold">{ui('تعديل بيانات العضو')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('name', 'الاسم')}
        {field('phone', 'رقم الموبايل', { dir: 'ltr', inputMode: 'tel', className: 'nums' })}
        {field('cardNumber', 'الرقم القومي', { dir: 'ltr', className: 'nums' })}
        <div className="space-y-1.5">
          <Label htmlFor="rm-gender">{ui('النوع')}</Label>
          <select id="rm-gender" className={selectCls} value={form.gender} onChange={set('gender')}>
            <option value="">—</option>
            <option value="male">{ui('ذكر')}</option>
            <option value="female">{ui('أنثى')}</option>
          </select>
        </div>
        {field('email', 'البريد الإلكتروني', { type: 'email', dir: 'ltr' })}
        {/* Birth date is shown but not editable from reception (client, 24 Nov). */}
        {field('dateOfBirth', 'تاريخ الميلاد', { type: 'date', dir: 'ltr', disabled: true, readOnly: true, className: 'bg-muted' })}
        {field('address', 'العنوان')}
        {field('jobTitle', 'الوظيفة')}
        <div className="space-y-1.5">
          <Label htmlFor="rm-marital">{ui('الحالة الاجتماعية')}</Label>
          <select id="rm-marital" className={selectCls} value={form.maritalStatus} onChange={set('maritalStatus')}>
            {MARITAL.map(([value, label]) => <option key={value} value={value}>{ui(label)}</option>)}
          </select>
        </div>
        {field('guardianName', 'اسم ولي الأمر')}
        {field('guardianPhone', 'هاتف ولي الأمر', { dir: 'ltr', inputMode: 'tel', className: 'nums' })}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rm-notes">{ui('الملاحظات')}</Label>
        <Textarea id="rm-notes" rows={3} value={form.notes} onChange={set('notes')} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button variant="outline" disabled={saving} onClick={onCancel}><X className="size-4" />{ui('إلغاء')}</Button>
        <Button variant="brand" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {ui('حفظ التعديلات')}
        </Button>
      </div>
    </section>
  );
}

/**
 * The member's attachments (ID card photo, documents…) on the reception member screen, with upload
 * and delete for staff with `club.members:update` (client, 24 Nov). Same API as the attachments page.
 */
export function ReceptionMemberAttachments({ memberId, canEdit }: { memberId: number; canEdit: boolean }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const queryKey = ['club-members', memberId, 'attachments'];
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await api.get<ClubMemberAttachment[]>(`/club-members/${memberId}/membership-documents`)).data,
  });
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!file) return void toast.error(ui('اختر المستند أولًا'));
    if (file.size > 5 * 1024 * 1024) return void toast.error(ui('الملف أكبر من 5 ميجابايت'));
    setSaving(true);
    try {
      await api.post(`/club-members/${memberId}/membership-documents`, buildMemberDocumentFormData(file, 'other', label.trim()));
      setFile(null);
      setLabel('');
      if (fileRef.current) fileRef.current.value = '';
      toast.success(ui('تم حفظ المرفق'));
      await qc.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (document: ClubMemberAttachment) => {
    const ok = await confirm({
      title: ui('حذف المرفق'),
      description: document.label || document.originalFilename,
      confirmLabel: ui('حذف'),
    });
    if (!ok) return;
    try {
      await api.delete(`/club-members/${memberId}/membership-documents/${document.id}`);
      toast.success(ui('تم حذف المرفق'));
      await qc.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const open = async (document: ClubMemberAttachment) => {
    const image = document.mimeType?.startsWith('image/');
    const popup = image ? null : window.open('', '_blank');
    if (!image && !popup) return void toast.error(ui('تعذر فتح المستند؛ يرجى السماح بالنوافذ المنبثقة.'));
    try {
      const { data: blob } = await api.get(document.downloadUrl, { responseType: 'blob' });
      const url = URL.createObjectURL(blob as Blob);
      if (image) {
        openImagePreview(url, document.originalFilename);
      } else if (popup) {
        popup.opener = null;
        popup.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      popup?.close();
      toast.error(apiError(error));
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border bg-muted/15 p-4">
      <h3 className="flex items-center gap-2 font-bold"><Paperclip className="size-4 text-primary" />{ui('مرفقات العضو')}</h3>
      {canEdit ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="rm-att-label">{ui('اسم المستند')}</Label>
            <Input id="rm-att-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder={ui('مثال: صورة البطاقة')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rm-att-file">{ui('الملف')}</Label>
            <Input id="rm-att-file" ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
          <Button variant="brand" disabled={!file || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {ui('رفع المرفق')}
          </Button>
          <p className="text-xs text-muted-foreground sm:col-span-3">{ui('PDF أو JPG أو PNG أو WEBP، بحد أقصى 5 ميجابايت.')}</p>
        </div>
      ) : null}
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{ui('جاري التحميل…')}</p>
      ) : data.length ? (
        <ul className="divide-y rounded-xl border bg-background">
          {data.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              {document.mimeType?.startsWith('image/') ? <ImageIcon className="size-4 shrink-0 text-primary" /> : <FileText className="size-4 shrink-0 text-primary" />}
              <span className="min-w-0 flex-1 truncate font-medium">{document.label || document.originalFilename}</span>
              <Button size="sm" variant="outline" className="h-8" onClick={() => void open(document)}>{ui('فتح')}</Button>
              {canEdit ? (
                <Button size="sm" variant="ghost" className="h-8 text-destructive" aria-label={ui('حذف المرفق')} onClick={() => void remove(document)}>
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{ui('لا توجد مرفقات بعد.')}</p>
      )}
    </section>
  );
}
