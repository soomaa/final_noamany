import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/club/member-avatar';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubMemberListItem, ClubMemberOverview } from '@/types/club';

export function ReceptionMemberProfile({ member, overview, branches, section }: {
  member: ClubMemberListItem;
  overview?: ClubMemberOverview;
  branches: Array<{ id: number; name: string | null }>;
  section: 'details' | 'records' | 'profile';
}) {
  const { ui } = useLocale();
  const value = (text?: string | number | null) => text == null || text === '' ? '—' : toArabicDigits(text);
  if (section === 'profile' && overview) {
    const lastFreeze = overview.freezes[0];
    return <div className="overflow-hidden rounded-2xl border">
      <div className="grid grid-cols-2 gap-3 border-b bg-muted/15 p-4 lg:grid-cols-4">{[
        ['إجمالي الاشتراكات', overview.subscriptionCount], ['اشتراكات اللوكر', overview.lockerSubscriptionCount],
        ['أيام الوقف', overview.suspendedDays], ['اشتراكات موقوفة', overview.frozenCount],
      ].map(([label, count]) => <div key={label} className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{ui(String(label))}</p><b className="mt-1 block nums">{value(count)}</b></div>)}</div>
      <div className="grid items-start gap-4 p-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-2xl border p-4 text-center"><MemberAvatar name={member.name} profilePicture={member.profilePicture} size="xl" className="size-36 ring-2 ring-primary/30" /><h3 className="text-xl font-bold">{member.name}</h3><StatusBadge status={member.isBlocked ? 'blocked' : member.isActive ? 'active' : 'suspended'} /><dl className="mt-2 w-full space-y-2 text-sm">{[
            ['كود العضو', member.memberCode], ['الموبايل', member.phone],
            ['الفرع', branches.find(b => b.id === member.branchId)?.name ?? member.branchId],
            ['النوع', ui(member.gender === 'female' ? 'أنثى' : 'ذكر')],
            ['آخر دخول', member.lastCheckIn ? formatDateTime(member.lastCheckIn) : null],
          ].map(([label, text]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{ui(String(label))}</dt><dd className="break-words">{value(text)}</dd></div>)}</dl></div>
          
          <section className="space-y-2 rounded-2xl border p-4 text-sm"><h3 className="font-bold">{ui('آخر وقف')}</h3>{lastFreeze ? <><b>{lastFreeze.subscriptionType || ui('اشتراك')}</b><p className="font-mono text-xs text-muted-foreground">{lastFreeze.subscriptionNumber}</p><p>{ui('من تاريخ')}: {value(lastFreeze.startDate)}</p><p>{ui('إلى تاريخ')}: {value(lastFreeze.endDate)}</p><p>{ui('عدد الأيام')}: {value(lastFreeze.actualDays ?? lastFreeze.plannedDays)}</p><StatusBadge status={lastFreeze.isActive ? 'active' : 'expired'} /></> : <p className="text-muted-foreground">{ui('لا يوجد وقف مسجل لهذا العضو')}</p>}</section>
          <details className="rounded-2xl border p-3"><summary className="cursor-pointer text-sm font-bold">{ui('كل بيانات العضو')}</summary><div className="mt-3"><ReceptionMemberProfile member={member} overview={overview} branches={branches} section="details" /></div></details>
        </aside>
        <div className="min-w-0"><ReceptionMemberProfile member={member} overview={overview} branches={branches} section="records" /></div>
      </div>
    </div>;
  }
  if (section === 'details') {
    const fields = [
      ['كود العضو', member.memberCode],
      ['الفرع', branches.find((b) => b.id === member.branchId)?.name ?? member.branchId],
      ['رقم الموبايل', member.phone], ['الرقم القومي', member.cardNumber],
      ['البريد الإلكتروني', member.email], ['النوع', ui(member.gender === 'female' ? 'أنثى' : 'ذكر')],
      ['تاريخ الميلاد', member.dateOfBirth], ['العنوان', member.address],
      ['الوظيفة', member.jobTitle], ['الحالة الاجتماعية', member.maritalStatus],
      ['نوع العضوية', member.membershipType?.name], ['بداية العضوية', member.startDate], ['نهاية العضوية', member.endDate],
      ['اسم ولي الأمر', member.guardianName], ['هاتف ولي الأمر', member.guardianPhone],
      ['رقم موظف المبيعات', member.salesId], ['رقم الموظف المسؤول', member.employeeId],
      ['تاريخ التسجيل', member.createdAt ? formatDateTime(member.createdAt) : null],
      ['آخر تحديث', member.updatedAt ? formatDateTime(member.updatedAt) : null],
      ['آخر حضور', overview?.member.lastCheckIn ? formatDateTime(overview.member.lastCheckIn) : null],
      ['الملاحظات', member.notes],
    ] as const;
    return <section className="space-y-4 rounded-2xl border bg-muted/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{ui('بيانات العضو')}</h3><StatusBadge status={member.isActive && !member.isBlocked ? 'active' : 'suspended'} /></div>
      {member.isBlocked ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{ui('سبب الحظر')}: {member.blockReason || '—'}</p> : null}
      <dl className="grid gap-3">{fields.map(([label, text]) => <div key={label} className="flex min-w-0 justify-between gap-3 border-b pb-2 last:border-0"><dt className="shrink-0 text-xs text-muted-foreground">{ui(label)}</dt><dd className="whitespace-pre-wrap break-words text-end text-sm font-medium">{value(text)}</dd></div>)}</dl>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button asChild size="sm" variant="outline"><Link to={`/club/members/${member.id}/details`}>{ui('ملف العضو وكل الاشتراكات')}</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to={`/club/members/${member.id}/attachments`}>{ui('مرفقات العضو')}</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to={`/club/members/${member.id}/membership-document`}>{ui('استمارة العضوية')}</Link></Button>
      </div>
    </section>;
  }
  if (!overview) return null;
  const empty = <p className="p-4 text-sm text-muted-foreground">{ui('لا توجد سجلات')}</p>;
  return <div className="space-y-4">
    <section className="overflow-hidden rounded-2xl border"><h3 className="border-b bg-muted/30 p-4 font-bold">{ui('آخر 10 اشتراكات')} · {ui('إجمالي الاشتراكات')}: {value(overview.subscriptionCount)}</h3>
      {overview.subscriptions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/15"><tr>{['الاشتراك', 'من', 'إلى', 'الحالة', 'المدة', 'مرتبط بحصص', 'المدفوع', 'المتبقي'].map((label) => <th key={label} className="p-3 text-start">{ui(label)}</th>)}</tr></thead><tbody>{overview.subscriptions.map((s) => <tr key={s.id} className="border-t"><td className="p-3"><b>{s.subscriptionTypeName ?? s.subscriptionType ?? ui('اشتراك')}</b><p className="font-mono text-xs text-muted-foreground">{s.subscriptionNumber}</p>{s.isLinkedToSessions ? <p className="mt-1 text-xs">{ui('الجلسات المتبقية')}: {value(Math.max(0, (s.sessionsCount ?? 0) - (s.sessionsUsed ?? 0)))}</p> : null}</td><td className="p-3 nums">{value(s.startDate)}</td><td className="p-3 nums">{value(s.endDate)}</td><td className="p-3"><StatusBadge status={s.status === 'frozen' ? 'suspended' : s.status === 'upcoming' ? 'pending' : s.status} /></td><td className="p-3 nums">{s.status === 'frozen' ? ui('موقوف') : s.daysOverdue != null ? ui('انتهى منذ') + ' ' + value(s.daysOverdue) + ' ' + ui('يوم') : s.daysUntilStart != null ? ui('يبدأ بعد') + ' ' + value(s.daysUntilStart) + ' ' + ui('يوم') : ui('متبقي') + ' ' + value(s.daysRemaining) + ' ' + ui('يوم')}</td><td className="p-3">{ui(s.isLinkedToSessions ? 'نعم' : 'لا')}</td><td className="p-3">{formatMoney(s.paidAmount)}</td><td className="p-3">{formatMoney(s.remainingAmount)}</td></tr>)}</tbody></table></div> : empty}
    </section>
    <section className="overflow-hidden rounded-2xl border"><h3 className="border-b bg-muted/30 p-4 font-bold">{ui('اشتراكات اللوكر')} ({value(overview.lockerSubscriptionCount)})</h3>
      {overview.lockerSubscriptions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/15"><tr>{['الفرع', 'نوع الاشتراك', 'تاريخ البداية', 'تاريخ النهاية', 'رقم اللوكر', 'الحالة', 'المدفوع', 'المتبقي'].map(label => <th key={label} className="p-3 text-start">{ui(label)}</th>)}</tr></thead><tbody>{overview.lockerSubscriptions.map(s => <tr key={s.id} className="border-t"><td className="p-3">{branches.find(b => b.id === s.branchId)?.name ?? value(s.branchId)}</td><td className="p-3"><b>{s.subscriptionTypeName || ui('لوكر')}</b><p className="font-mono text-xs text-muted-foreground">{s.subscriptionNumber}</p></td><td className="p-3 nums">{value(s.startDate)}</td><td className="p-3 nums">{value(s.endDate)}</td><td className="p-3 nums">{value(s.lockerNumber)}</td><td className="p-3"><StatusBadge status={s.status === 'frozen' ? 'suspended' : s.status === 'upcoming' ? 'pending' : s.status} /></td><td className="p-3">{formatMoney(s.paidAmount)}</td><td className="p-3">{formatMoney(s.remainingAmount)}</td></tr>)}</tbody></table></div> : empty}
    </section>
    <section className="overflow-hidden rounded-2xl border"><h3 className="border-b bg-muted/30 p-4 font-bold">{ui('سجل الوقف والتجميد')}</h3>
      {overview.freezes.length ? <div className="divide-y">{overview.freezes.map((f, index) => <div key={`${f.subscriptionId}-${index}`} className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><b>{f.subscriptionType ?? ui('اشتراك')} — {f.subscriptionNumber}</b><span className={f.isActive ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}>{ui(f.isActive ? 'وقف حالي' : 'وقف سابق')}</span></div>
        <p>{ui('من')}: {value(f.startDate)} — {ui('إلى')}: {value(f.endDate)} · {ui('الأيام المخططة')}: {value(f.plannedDays)} · {ui('الأيام الفعلية')}: {value(f.actualDays)}</p>
        <p className="whitespace-pre-wrap text-muted-foreground">{ui('السبب')}: {f.reason || '—'}</p>
      </div>)}</div> : empty}
    </section>
    <div className="grid items-start gap-4 md:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border"><h3 className="border-b bg-muted/30 p-4 font-bold">{ui('آخر 10 إيصالات')}</h3>
        {overview.recentReceipts?.length ? <div className="divide-y">{overview.recentReceipts.map((r) => <div key={r.id} className="space-y-1 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><b className="font-mono">{r.receiptNumber}</b><b>{formatMoney(r.amount)}</b></div><p className="text-muted-foreground">{value(r.date)} · {r.status}</p>{r.description ? <p>{r.description}</p> : null}</div>)}</div> : empty}
      </section>
      <section className="overflow-hidden rounded-2xl border"><h3 className="border-b bg-muted/30 p-4 font-bold">{ui('آخر 10 سجلات حضور')}</h3>
        {overview.recentAttendance?.length ? <div className="divide-y">{overview.recentAttendance.map((a) => <div key={a.id} className="space-y-1 p-3 text-sm"><b>{a.subscriptionType || ui('حضور')}</b><p>{ui('الدخول')}: {formatDateTime(a.checkIn)}</p><p className="text-muted-foreground">{ui('الخروج')}: {a.checkOut ? formatDateTime(a.checkOut) : '—'}</p>{a.notes ? <p>{a.notes}</p> : null}</div>)}</div> : empty}
      </section>
    </div>
    <section className="overflow-hidden rounded-2xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 p-4"><h3 className="font-bold">{ui('سجل نقاط العضو')}</h3>{overview.points ? <span className="text-sm">{ui('رصيد النقاط')}: <b className="nums">{value(overview.points.points)}</b> · {ui('القيمة')}: {formatMoney(overview.points.value)}</span> : null}</div>
      {overview.points?.history.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-muted/15"><tr>{['التاريخ', 'الحركة', 'النقاط', 'القيمة', 'البيان', 'تاريخ الانتهاء'].map(label => <th key={label} className="p-3 text-start">{ui(label)}</th>)}</tr></thead><tbody>{overview.points.history.map(row => <tr key={`${row.type}-${row.id}`} className="border-t"><td className="p-3 nums">{value(row.occurredOn)}</td><td className="p-3">{ui(row.type === 'earn' ? 'نقاط مكتسبة' : 'نقاط مستخدمة')}</td><td className="p-3 nums">{value(row.points)}</td><td className="p-3">{row.value == null ? '—' : formatMoney(row.value)}</td><td className="p-3">{row.action || '—'}</td><td className="p-3 nums">{value(row.expiresOn)}</td></tr>)}</tbody></table></div> : <p className="p-4 text-sm text-muted-foreground">{ui('لا توجد حركات نقاط لهذا العضو')}</p>}
    </section>
  </div>;
}
