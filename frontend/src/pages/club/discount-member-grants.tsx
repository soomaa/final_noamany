import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Loader2, Search, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { isSystemAdminUser } from '@/lib/user-scope';
import { toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { MemberGenderSelect, useMemberGenderFilter } from '@/components/club/member-gender-filter';

type Code = { id: number; code: string; percentage: number };
type Assignment = { employeeId: number | null; codeId: number | null; allowedCount: number; remainingThisMonth?: number };
type Grant = {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  memberName?: string | null;
  memberCode: string | null;
  code: string | null;
  percentage: number;
  expiresOn: string | null;
  used: boolean;
};
type GrantMember = { id: number; name: string; memberCode: string; phone: string | null };

const today = () => new Date().toLocaleDateString('en-CA');
const isValidNow = (grant: Grant) => !grant.used && (!grant.expiresOn || grant.expiresOn >= today());
const GRANTS_KEY = ['club-discount-codes', 'member-grants'];

function MemberCard({ member }: { member: GrantMember }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <UserRound className="size-5" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="truncate text-base font-semibold">{member.name}</p>
        <p className="text-muted-foreground">
          <span className="nums font-mono" dir="ltr">{member.memberCode}</span>
          {member.phone ? <> · <span className="nums">{toArabicDigits(member.phone)}</span></> : null}
        </p>
      </div>
    </div>
  );
}

/** Member lookup by member code or mobile, shared by both screens. Enter searches. */
function MemberLookup({ onFound, onClear }: { onFound: (member: GrantMember) => void; onClear: () => void }) {
  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const search = async () => {
    if (!term.trim() || searching) return;
    setSearching(true);
    try {
      const { data } = await api.get<GrantMember>('/club-discount-codes/member-grants/member-lookup', { params: { term: term.trim() } });
      onFound(data);
    } catch (error) {
      onClear();
      toast.error(apiError(error));
    } finally {
      setSearching(false);
    }
  };
  return (
    <div className="flex gap-2">
      <Input
        value={term}
        placeholder="كود العضو أو رقم الموبايل"
        onChange={(event) => { setTerm(event.target.value); onClear(); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }}
      />
      <Button type="button" variant="outline" disabled={!term.trim() || searching} onClick={() => void search()}>
        {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} بحث
      </Button>
    </div>
  );
}

function GrantsTable({ grants, onRevoke, revokingId }: { grants: Grant[]; onRevoke?: (grant: Grant) => void; revokingId?: number | null }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>كود العضو</TableHead>
            <TableHead>اسم العضو</TableHead>
            <TableHead>الكابتن</TableHead>
            <TableHead>كود الخصم</TableHead>
            <TableHead>صالح حتى</TableHead>
            <TableHead>الحالة</TableHead>
            {onRevoke ? <TableHead className="w-24 text-center">حذف</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {grants.length === 0 ? (
            <TableRow>
              <TableCell colSpan={onRevoke ? 7 : 6} className="py-8 text-center text-muted-foreground">لا توجد أكواد</TableCell>
            </TableRow>
          ) : grants.map((grant) => (
            <TableRow key={grant.id}>
              <TableCell className="nums font-mono" dir="ltr">{grant.memberCode ?? '—'}</TableCell>
              <TableCell className="font-medium">{grant.memberName ?? '—'}</TableCell>
              <TableCell>{grant.employeeName ?? '—'}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <BadgePercent className="size-4 text-primary" />
                  {grant.code ?? '—'} <span className="nums text-muted-foreground">({toArabicDigits(grant.percentage)}%)</span>
                </span>
              </TableCell>
              <TableCell className="nums">{grant.expiresOn ? toArabicDigits(grant.expiresOn) : '—'}</TableCell>
              <TableCell>
                {grant.used
                  ? <StatusBadge status="info" label="مستخدم" />
                  : isValidNow(grant)
                    ? <StatusBadge status="active" label="متاح" />
                    : <StatusBadge status="expired" label="منتهي" />}
              </TableCell>
              {onRevoke ? (
                <TableCell className="text-center">
                  {!grant.used ? (
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label="حذف الكود"
                      disabled={revokingId === grant.id} onClick={() => onRevoke(grant)}>
                      {revokingId === grant.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </Button>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** كود خصم لعضو: give one of the captain's monthly codes to a member; this month's grants below. */
export function DiscountMemberGrantsView() {
  const qc = useQueryClient();
  const { user } = useAuth();
  // A captain or receptionist works on their own codes only: the employee is the signed-in account.
  const ownEmployeeId = !isSystemAdminUser(user) && user?.emp_code ? String(user.emp_code) : null;
  const [employeeId, setEmployeeId] = useState(ownEmployeeId ?? '');
  const [codeId, setCodeId] = useState('');
  const [member, setMember] = useState<GrantMember | null>(null);
  const [lookupKey, setLookupKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const g = useMemberGenderFilter();

  const { data: employeeOptions = [] } = useEmployeeOptions(!ownEmployeeId);
  const { data: codes = [] } = useQuery({ queryKey: ['club-discount-codes'], queryFn: async () => (await api.get<Code[]>('/club-discount-codes')).data });
  const { data: assignments = [] } = useQuery({
    queryKey: ['club-discount-codes', 'employee-assignments'],
    queryFn: async () => (await api.get<Assignment[]>('/club-discount-codes/employee-assignments')).data,
  });
  const { data: grants = [], isLoading } = useQuery({
    queryKey: [...GRANTS_KEY, 'current-month', g.value],
    queryFn: async () => (await api.get<Grant[]>('/club-discount-codes/member-grants', { params: { period: 'current', gender: g.param } })).data,
  });

  const myCodes = useMemo(() => codes.flatMap((code) => {
    const assignment = assignments.find((row) => row.employeeId === Number(employeeId) && row.codeId === code.id);
    return assignment ? [{ ...code, allowed: assignment.allowedCount, left: assignment.remainingThisMonth ?? assignment.allowedCount }] : [];
  }), [assignments, codes, employeeId]);
  const selectedCode = myCodes.find((code) => String(code.id) === codeId);
  const visibleGrants = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return grants;
    return grants.filter((grant) => [grant.memberCode, grant.memberName, grant.employeeName, grant.code]
      .some((value) => value?.toLowerCase().includes(term)));
  }, [filter, grants]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['club-discount-codes'] });
  const save = async () => {
    if (!employeeId || !codeId || !member || saving) return;
    setSaving(true);
    try {
      await api.post('/club-discount-codes/member-grants', { employeeId: Number(employeeId), codeId: Number(codeId), memberId: member.id });
      toast.success(`تم منح الكود ${selectedCode?.code ?? ''} للعضو ${member.name}`);
      // Ready for the next member: the captain stays, code and member are cleared.
      setCodeId('');
      setMember(null);
      setLookupKey((key) => key + 1);
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };
  const revoke = async (grant: Grant) => {
    const ok = await confirm({
      title: 'حذف كود الخصم؟',
      description: `سيتم حذف الكود ${grant.code ?? ''} من العضو ${grant.memberName ?? grant.memberCode ?? ''}، ويرجع للرصيد المتاح هذا الشهر.`,
      variant: 'destructive',
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    setRevokingId(grant.id);
    try {
      await api.delete(`/club-discount-codes/member-grants/${grant.id}`);
      toast.success('تم حذف الكود');
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="كود خصم لعضو" />
      <Card>
        <CardHeader><CardTitle className="text-base">منح كود خصم</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>الكابتن / الموظف</Label>
              {ownEmployeeId
                ? <Input value={user?.name ?? ''} readOnly disabled aria-label="الكابتن/الموظف" />
                : <Combobox value={employeeId} onValueChange={(value) => { setEmployeeId(value); setCodeId(''); }} options={employeeOptions} placeholder="اختر الكابتن/الموظف" searchPlaceholder="ابحث باسم الموظف أو رقمه" emptyText="لا يوجد موظف مطابق" />}
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>العضو</Label>
              <MemberLookup key={lookupKey} onFound={setMember} onClear={() => setMember(null)} />
            </div>
          </div>

          {member ? <MemberCard member={member} /> : null}

          <div className="space-y-2">
            <Label>كود الخصم</Label>
            {!employeeId ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">اختر الكابتن لعرض أكواده.</p>
            ) : myCodes.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">لا توجد أكواد موزعة على هذا الكابتن.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {myCodes.map((code) => {
                  const selected = String(code.id) === codeId;
                  const empty = code.left <= 0;
                  return (
                    <button key={code.id} type="button" disabled={empty} onClick={() => setCodeId(String(code.id))}
                      className={`rounded-xl border p-3 text-start transition-all ${selected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:border-primary/40'} ${empty ? 'cursor-not-allowed opacity-50' : ''}`}>
                      <span className="flex items-center justify-between gap-2">
                        <b>{code.code}</b>
                        <span className="nums rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{toArabicDigits(code.percentage)}%</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        المتبقي هذا الشهر <b className="nums text-foreground">{toArabicDigits(Math.max(0, code.left))}</b> من <span className="nums">{toArabicDigits(code.allowed)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="brand" disabled={!employeeId || !codeId || !member || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <BadgePercent className="size-4" />} منح الكود للعضو
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            أكواد هذا الشهر <span className="nums text-sm font-normal text-muted-foreground">({toArabicDigits(grants.length)})</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <MemberGenderSelect value={g.value} onChange={g.setValue} locked={g.locked} hideLabel />
            <Input className="max-w-xs" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="بحث بكود العضو أو الاسم" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading
            ? <p className="py-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
            : <GrantsTable grants={visibleGrants} onRevoke={(grant) => void revoke(grant)} revokingId={revokingId} />}
        </CardContent>
      </Card>
    </div>
  );
}

/** البحث عن كود خصم: the member's codes that can still be used (unused, not expired). */
export function DiscountMemberSearchView() {
  const [member, setMember] = useState<GrantMember | null>(null);
  const { data: grants = [], isFetching } = useQuery({
    queryKey: [...GRANTS_KEY, 'member', member?.id],
    enabled: member != null,
    queryFn: async () => (await api.get<Grant[]>('/club-discount-codes/member-grants', { params: { memberId: member!.id } })).data,
  });
  const valid = grants.filter(isValidNow);
  return (
    <div className="space-y-6">
      <PageHeader title="البحث عن كود خصم" />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="max-w-xl space-y-2">
            <Label>العضو</Label>
            <MemberLookup onFound={setMember} onClear={() => setMember(null)} />
          </div>
          {member ? <MemberCard member={member} /> : null}
        </CardContent>
      </Card>
      {member ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              الأكواد المتاحة هذا الشهر <span className="nums text-sm font-normal text-muted-foreground">({toArabicDigits(valid.length)})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isFetching
              ? <p className="py-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
              : <GrantsTable grants={valid} />}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
