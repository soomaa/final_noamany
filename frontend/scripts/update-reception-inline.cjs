const fs = require('fs'), path = require('path');
const file = path.resolve(__dirname, '../src/pages/club/reception.tsx');
let s = fs.readFileSync(file, 'utf8');
const qstart = s.indexOf('  const { data: recent } = useQuery({');
const qend = s.indexOf('  const { data: quickServices', qstart);
if (qstart < 0 || qend < 0) throw Error('Recent query anchors missing');
s = s.slice(0, qstart) + s.slice(qend);
const rstart = s.indexOf('        {recent && recent.length > 0 && (');
const rend = s.indexOf('\n      </div>', rstart);
if (rstart < 0 || rend < 0) throw Error('Recent UI anchors missing');
s = s.slice(0, rstart) + s.slice(rend);
const pstart = s.indexOf('      <Dialog open={memberOpen} onOpenChange={closeMemberPanel}>');
const pend = s.indexOf('\n      <Dialog\n        open={blockOpen}', pstart);
if (pstart < 0 || pend < 0) throw Error('Profile anchors missing');
let panel = s.slice(pstart, pend);
const headEnd = panel.indexOf('          {loadingOverview ?');
const header = `      {memberOpen && selectedId != null ? (
        <section id="reception-member-profile" className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6" aria-label={ui('بروفايل العضو')}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{ui('بروفايل العضو')}</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={loadingMember || loadingSubs} onClick={() => { void refetchSubs(); if (selectedId) void refreshEntitlement(selectedId); }}><RefreshCw className={cn('size-4', loadingMember && 'animate-spin')} />{ui('تحديث')}</Button>
              <Button variant="outline" size="sm" onClick={() => closeMemberPanel(false)}>{ui('إغلاق البروفايل')}</Button>
            </div>
          </div>
          {member && overview ? <ReceptionMemberProfile member={member} overview={overview} branches={branches} section="profile" /> : null}
          {entitlement ? <EntitlementBanner entitlement={entitlement} canGrace={canCheckIn && !member?.isBlocked} onGrace={() => openGrace()} /> : null}
`;
panel = header + panel.slice(headEnd);
panel = panel.replace('          {member && overview ? <ReceptionMemberProfile member={member} overview={overview} branches={branches} section="records" /> : null}\n', '');
panel = panel.replace('        </DialogContent>\n      </Dialog>', '        </section>\n      ) : null}');
s = s.slice(0, pstart) + s.slice(pend);
const searchEnd = s.indexOf('\n      {(canSellQuick || canManageQuick)');
if (searchEnd < 0) throw Error('Search end anchor missing');
s = s.slice(0, searchEnd) + '\n' + panel + s.slice(searchEnd);
s = s.replace('  RecentCheckIn,\n', '');
fs.writeFileSync(file, s);
