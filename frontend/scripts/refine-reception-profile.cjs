const fs = require('fs'), path = require('path');
const file = path.resolve(__dirname, '../src/components/club/reception-member-profile.tsx');
let s = fs.readFileSync(file, 'utf8');
s = s.replace('<ReceptionMemberProfile member={member} overview={overview} branches={branches} section="details" />', '');
const asideEnd = s.indexOf('        </aside>');
s = s.slice(0, asideEnd) + '          <details className="rounded-2xl border p-3"><summary className="cursor-pointer text-sm font-bold">{ui(\'كل بيانات العضو\')}</summary><div className="mt-3"><ReceptionMemberProfile member={member} overview={overview} branches={branches} section="details" /></div></details>\n' + s.slice(asideEnd);
const brief = `<dl className="mt-2 w-full space-y-2 text-sm">{[
            ['كود العضو', member.memberCode], ['الموبايل', member.phone],
            ['الفرع', branches.find(b => b.id === member.branchId)?.name ?? member.branchId],
            ['النوع', ui(member.gender === 'female' ? 'أنثى' : 'ذكر')],
            ['آخر دخول', member.lastCheckIn ? formatDateTime(member.lastCheckIn) : null],
          ].map(([label, text]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{ui(String(label))}</dt><dd className="break-words">{value(text)}</dd></div>)}</dl>`;
s = s.replace('<StatusBadge status={member.isBlocked ? \'blocked\' : member.isActive ? \'active\' : \'suspended\'} /></div>', '<StatusBadge status={member.isBlocked ? \'blocked\' : member.isActive ? \'active\' : \'suspended\'} />' + brief + '</div>');
s = s.replace("['الاشتراك', 'من', 'إلى', 'المدفوع', 'المتبقي', 'الحالة']", "['الاشتراك', 'من', 'إلى', 'الحالة', 'المدة', 'مرتبط بحصص', 'المدفوع', 'المتبقي']");
const status = `<td className="p-3"><StatusBadge status={s.status === 'frozen' ? 'suspended' : s.status === 'upcoming' ? 'pending' : s.status} /></td>`;
s = s.replace(status + '</tr>)}</tbody></table>', '</tr>)}</tbody></table>');
s = s.replace('<td className="p-3">{formatMoney(s.paidAmount)}</td>', status + `<td className="p-3 nums">{s.status === 'frozen' ? ui('موقوف') : s.daysOverdue != null ? ui('انتهى منذ') + ' ' + value(s.daysOverdue) + ' ' + ui('يوم') : s.daysUntilStart != null ? ui('يبدأ بعد') + ' ' + value(s.daysUntilStart) + ' ' + ui('يوم') : ui('متبقي') + ' ' + value(s.daysRemaining) + ' ' + ui('يوم')}</td><td className="p-3">{ui(s.isLinkedToSessions ? 'نعم' : 'لا')}</td><td className="p-3">{formatMoney(s.paidAmount)}</td>`);
const lockerStart = s.indexOf('      {overview.lockerSubscriptions.length ?');
const lockerEnd = s.indexOf('\n    </section>', lockerStart);
s = s.slice(0, lockerStart) + `      {overview.lockerSubscriptions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/15"><tr>{['الفرع', 'نوع الاشتراك', 'تاريخ البداية', 'تاريخ النهاية', 'رقم اللوكر', 'الحالة', 'المدفوع', 'المتبقي'].map(label => <th key={label} className="p-3 text-start">{ui(label)}</th>)}</tr></thead><tbody>{overview.lockerSubscriptions.map(s => <tr key={s.id} className="border-t"><td className="p-3">{branches.find(b => b.id === s.branchId)?.name ?? value(s.branchId)}</td><td className="p-3"><b>{s.subscriptionTypeName || ui('لوكر')}</b><p className="font-mono text-xs text-muted-foreground">{s.subscriptionNumber}</p></td><td className="p-3 nums">{value(s.startDate)}</td><td className="p-3 nums">{value(s.endDate)}</td><td className="p-3 nums">{value(s.lockerNumber)}</td><td className="p-3"><StatusBadge status={s.status === 'frozen' ? 'suspended' : s.status === 'upcoming' ? 'pending' : s.status} /></td><td className="p-3">{formatMoney(s.paidAmount)}</td><td className="p-3">{formatMoney(s.remainingAmount)}</td></tr>)}</tbody></table></div> : empty}` + s.slice(lockerEnd);
fs.writeFileSync(file, s);
