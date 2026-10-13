import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileText, Image, Loader2, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { buildMemberDocumentFormData } from '@/lib/member-document-model';
import type { ClubMemberAttachment } from '@/types/club';

function AttachmentPreview({ document }: { document: ClubMemberAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (!document.mimeType.startsWith('image/')) return; let active = true; let objectUrl = ''; void api.get(document.downloadUrl, { responseType: 'blob' }).then(({ data }) => { objectUrl = URL.createObjectURL(data as Blob); if (active) setUrl(objectUrl); }).catch(() => setUrl(null)); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [document.downloadUrl, document.mimeType]);
  return url ? <img src={url} alt={document.label || document.originalFilename} className="h-full w-full rounded-xl object-cover" /> : document.mimeType.startsWith('image/') ? <Image className="size-12 text-primary" /> : <FileText className="size-12 text-primary" />;
}

export function ClubMemberAttachmentsPage() {
  const { id } = useParams(); const memberId = Number(id); const navigate = useNavigate(); const queryClient = useQueryClient();
  const { can } = usePermission(); const canUpdateMembers = can('club.members:update');
  const [label, setLabel] = useState(''); const [file, setFile] = useState<File | null>(null); const [saving, setSaving] = useState(false);
  const { data = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ['club-members', memberId, 'attachments'], enabled: memberId > 0, queryFn: async () => (await api.get<ClubMemberAttachment[]>(`/club-members/${memberId}/membership-documents`)).data });
  const save = async () => { if (!file) return toast.error('اختر المستند أولًا'); setSaving(true); try { await api.post(`/club-members/${memberId}/membership-documents`, buildMemberDocumentFormData(file, 'other', label)); setFile(null); setLabel(''); toast.success('تم حفظ المرفق'); await queryClient.invalidateQueries({ queryKey: ['club-members', memberId, 'attachments'] }); } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); } };
  const remove = async (documentId: number) => { try { await api.delete(`/club-members/${memberId}/membership-documents/${documentId}`); await queryClient.invalidateQueries({ queryKey: ['club-members', memberId, 'attachments'] }); } catch (e) { toast.error(apiError(e)); } };
  const openAttachment = async (document: ClubMemberAttachment) => { const popup = window.open('', '_blank'); if (!popup) { toast.error('تعذر فتح المستند؛ يرجى السماح بالنوافذ المنبثقة.'); return; } popup.opener = null; try { const { data: blob } = await api.get(document.downloadUrl, { responseType: 'blob' }); const url = URL.createObjectURL(blob as Blob); popup.location.href = url; popup.opener = null; window.setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch (e) { popup.close(); toast.error(apiError(e)); } };
  if (isLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (isError) return <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />;
  return <div className="space-y-6"><PageHeader title="مرفقات العضو" description="أضف صورة البطاقة أو أي مستند داعم، وستظهر الملفات المحفوظة هنا بشكل منظم." actions={<Button variant="outline" onClick={() => navigate(`/club/members/${memberId}/details`)}><ArrowRight className="size-4" /> العودة للتفاصيل</Button>} />{canUpdateMembers ? <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"><div><Label>اسم المستند</Label><Input className="mt-2" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: صورة البطاقة" /></div><div><Label>المستند</Label><Input className="mt-2" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div><Button className="self-end" variant="brand" disabled={!file || saving} onClick={() => void save()}><Save className="size-4" /> حفظ</Button></div><p className="mt-3 text-xs text-muted-foreground">PDF أو JPG أو PNG أو WEBP، بحد أقصى 5 ميجابايت.</p></section> : null}<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map((document) => <article key={document.id} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-muted"><AttachmentPreview document={document} /></div><h2 className="mt-3 truncate font-bold">{document.label || document.originalFilename}</h2><p className="mt-1 text-xs text-muted-foreground">{document.originalFilename}</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => void openAttachment(document)}><Upload className="size-3.5" /> فتح</Button>{canUpdateMembers ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(document.id)}><Trash2 className="size-3.5" /> حذف</Button> : null}</div></article>)}{!data.length ? <p className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">لا توجد مرفقات بعد.</p> : null}</section></div>;
}
