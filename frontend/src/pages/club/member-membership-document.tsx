import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';

function fieldValue(value: string | null | undefined) {
  return value?.trim() || '—';
}

function DocumentField({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return <div className={wide ? 'col-span-2 border-b border-slate-300 px-2 py-3' : 'border-b border-slate-300 px-2 py-3'}><span className="font-bold">{label}: </span><span>{fieldValue(value)}</span></div>;
}

export function ClubMemberMembershipDocumentPage() {
  const { id } = useParams();
  const memberId = Number(id);
  const navigate = useNavigate();
  const { data: member, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['club-members', memberId, 'membership-document'],
    enabled: Number.isInteger(memberId) && memberId > 0,
    queryFn: async () => (await api.get<ClubMemberListItem>(`/club-members/${memberId}`)).data,
  });

  if (isLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  if (isError || !member) return <ErrorState message={error instanceof Error ? error.message : 'تعذر تحميل بيانات العضو'} onRetry={() => void refetch()} />;

  return <div className="space-y-6">
    <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } body * { visibility: hidden; } #membership-document, #membership-document * { visibility: visible; } #membership-document { position: absolute; inset: 0; width: 100%; box-shadow: none !important; border: 0 !important; } .no-print { display: none !important; } }`}</style>
    <div className="no-print"><PageHeader title="مستند العضوية" description="نموذج عضوية مُعبأ ببيانات العضو وجاهز للطباعة." actions={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate(`/club/members/${member.id}/details`)}><ArrowRight className="size-4" /> العودة للتفاصيل</Button><Button variant="brand" onClick={() => window.print()}><Printer className="size-4" /> طباعة</Button></div>} /></div>

    <article id="membership-document" dir="rtl" className="mx-auto max-w-[210mm] bg-white p-7 text-[13px] leading-7 text-slate-900 shadow-sm print:p-0">
      <header className="border-b-2 border-rose-700 pb-4 text-center"><p className="text-base font-bold text-rose-700">Noamany Fitness Center</p><h1 className="mt-1 text-2xl font-extrabold">إقرار عضوية بالنادي</h1><p className="text-sm">Membership Application &amp; Declaration</p></header>
      <p className="mt-5 rounded border border-slate-300 bg-slate-50 p-3 text-center">أقر أنا الموقع أدناه بصحة البيانات التالية، وأوافق على لائحة وقواعد الاشتراك بالنادي.</p>
      <section className="mt-5 grid grid-cols-2 border border-slate-300"><DocumentField label="كود العضو" value={toArabicDigits(member.memberCode)} /><DocumentField label="نوع العضوية" value={member.membershipType?.name} /><DocumentField label="الاسم" value={member.name} /><DocumentField label="الجنس" value={member.gender === 'male' ? 'ذكر' : 'أنثى'} /><DocumentField label="الرقم القومي" value={member.cardNumber ? toArabicDigits(member.cardNumber) : null} /><DocumentField label="رقم الموبايل" value={member.phone ? toArabicDigits(member.phone) : null} /><DocumentField label="تاريخ الميلاد" value={member.dateOfBirth ? toArabicDigits(member.dateOfBirth) : null} /><DocumentField label="الحالة الاجتماعية" value={member.maritalStatus} /><DocumentField label="البريد الإلكتروني" value={member.email} wide /><DocumentField label="العنوان" value={member.address} wide /><DocumentField label="الوظيفة" value={member.jobTitle} /><DocumentField label="تاريخ بدء العضوية" value={member.startDate ? toArabicDigits(member.startDate) : null} /></section>
      <section className="mt-6"><h2 className="border-b border-slate-400 pb-1 text-base font-extrabold">إقرار العضوية</h2><ol className="mt-3 list-decimal space-y-1 pe-5 text-justify"><li>أتعهد بالالتزام بتعليمات الأمن والسلامة ولوائح النادي طوال مدة العضوية.</li><li>أتحمل مسؤولية صحة البيانات المقدمة، وألتزم بإبلاغ الإدارة بأي تغيير فيها.</li><li>لا يحق للعضو التنازل عن الاشتراك أو تحويله إلا وفق الإجراءات المعتمدة من إدارة النادي.</li><li>يحتفظ النادي بحقه في إيقاف العضوية عند مخالفة اللوائح أو عدم سداد الالتزامات المستحقة.</li></ol></section>
      <footer className="mt-14 grid grid-cols-2 gap-16 text-center"><div className="border-t border-slate-500 pt-2">توقيع العضو<br /><span className="text-xs text-slate-500">{member.name}</span></div><div className="border-t border-slate-500 pt-2">اعتماد إدارة النادي<br /><span className="text-xs text-slate-500">ختم وتوقيع</span></div></footer>
    </article>
  </div>;
}
