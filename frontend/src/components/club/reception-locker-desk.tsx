import { KeyRound, Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, apiError } from '@/lib/api';
import { searchClubMembers } from '@/lib/club-member-search';
import { formatDateTime } from '@/lib/formatters';
import { isReceptionSearchReady } from '@/lib/reception-scan';
import { cn, toArabicDigits } from '@/lib/utils';
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';

interface OpenHandoff {
  handoffId: number;
  memberId: number;
  memberName: string;
  memberCode: string;
  memberGender?: 'male' | 'female' | null;
  lockerId: number;
  lockerNumber: string;
  lockerSection?: 'male' | 'female' | 'shared';
  branchId: number;
  assignedAt: string;
}

interface AvailableLocker {
  id: number;
  lockerNumber: string;
  branchId: number;
  section?: 'male' | 'female' | 'shared';
}

interface OpenHandoffsResponse {
  splitByGender?: boolean;
  holding: OpenHandoff[];
  availableLockers: AvailableLocker[];
}

interface SearchHit {
  id: number;
  name: string;
  memberCode: string;
  branchId: number;
}

interface DeskResponse {
  splitByGender?: boolean;
  section?: 'male' | 'female' | null;
  lockers: Array<{ id: number; lockerNumber: string; available: boolean; section?: 'male' | 'female' | 'shared' }>;
  current: { lockerId: number; lockerNumber: string } | null;
}

function lockerFitsMember(
  section: string | undefined,
  gender: string | null | undefined,
  split: boolean,
) {
  if (!split) return true;
  if (!section || section === 'shared') return true;
  if (gender !== 'male' && gender !== 'female') return true;
  return section === gender;
}

function useOpenHandoffs(branchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['locker-open-handoffs', branchId || 'all'],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<OpenHandoffsResponse>('/club-lockers/handoffs/open', {
        params: { branchId: branchId || undefined },
      });
      return data;
    },
    refetchInterval: enabled ? 30_000 : false,
  });
}

export function ReceptionLockerDeskButton({ branchId }: { branchId?: string }) {
  const { ui } = useLocale();
  const [open, setOpen] = useState(false);
  const count = useOpenHandoffs(branchId);

  return (
    <>
      <Button type="button" variant="outline" className="min-w-0 flex-1 gap-2 sm:flex-none" onClick={() => setOpen(true)}>
        <KeyRound className="size-4" />
        {ui('لوكرات مع الأعضاء')}
        {(count.data?.holding.length ?? 0) > 0 ? (
          <span className="nums rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
            {toArabicDigits(count.data?.holding.length ?? 0)}
          </span>
        ) : null}
      </Button>
      <ReceptionLockerDeskDialog open={open} onOpenChange={setOpen} branchId={branchId} />
    </>
  );
}

function ReceptionLockerDeskDialog({
  open,
  onOpenChange,
  branchId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId?: string;
}) {
  const { ui, locale } = useLocale();
  const { can, superAdmin } = usePermission();
  const canManage =
    superAdmin ||
    can('club.reception:create') ||
    can('club.reception:update') ||
    can('club.members.attendance:create') ||
    can('club.lockers.list:update');
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [giveLockerId, setGiveLockerId] = useState('');
  const searchTimer = useRef<number | null>(null);
  const searchRequest = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  useEffect(() => {
    searchRequest.current += 1;
    searchController.current?.abort();
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    setHits([]);
    setPicked(null);
    setSearchingMembers(false);
    return () => {
      searchRequest.current += 1;
      searchController.current?.abort();
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [branchId]);

  const desk = useOpenHandoffs(branchId, open);

  const memberDesk = useQuery({
    queryKey: ['locker-desk', picked?.id],
    enabled: open && picked != null,
    queryFn: async () => (await api.get<DeskResponse>('/club-lockers/desk', { params: { memberId: picked!.id } })).data,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['locker-open-handoffs'] });
    await qc.invalidateQueries({ queryKey: ['locker-desk'] });
    await qc.invalidateQueries({ queryKey: ['club-lockers'] });
    await qc.invalidateQueries({ queryKey: ['club-member-profile-summary'] });
  };

  const clock = (value: string) => formatDateTime(value, locale === 'en' ? 'en' : 'ar', { seconds: true });

  const release = async (row: OpenHandoff) => {
    setPendingId(row.memberId);
    try {
      const { data } = await api.post<{ released: boolean }>('/club-lockers/handoff/release', {
        memberId: row.memberId,
      });
      if (data.released) toast.success(`${ui('تم تسليم اللوكر رقم')} ${row.lockerNumber}`);
      else toast.info(ui('اللوكر متسلّم بالفعل'));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setPendingId(null);
    }
  };

  const changeLocker = async (row: OpenHandoff, lockerId: string) => {
    if (!lockerId || lockerId === String(row.lockerId)) return;
    setPendingId(row.memberId);
    try {
      const { data } = await api.post<{ lockerNumber: string }>('/club-lockers/handoff', {
        lockerId: Number(lockerId),
        memberId: row.memberId,
      });
      toast.success(`${ui('اتغير اللوكر لرقم')} ${data.lockerNumber}`);
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setPendingId(null);
    }
  };

  const searchMembers = (raw: string) => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchController.current?.abort();
    const request = ++searchRequest.current;
    const q = raw.trim();
    if (!isReceptionSearchReady(q)) {
      setHits([]);
      setSearchingMembers(false);
      return;
    }
    setHits([]);
    setSearchingMembers(true);
    const controller = new AbortController();
    searchController.current = controller;
    searchTimer.current = window.setTimeout(() => {
      const parsedBranchId = Number(branchId);
      void searchClubMembers(q, {
        branchId: Number.isInteger(parsedBranchId) && parsedBranchId > 0 ? parsedBranchId : undefined,
        signal: controller.signal,
      })
        .then(({ hits: nextHits }) => {
          if (request !== searchRequest.current) return;
          setHits(nextHits);
        })
        .catch((error) => {
          if (request !== searchRequest.current) return;
          setHits([]);
          toast.error(apiError(error));
        })
        .finally(() => {
          if (request === searchRequest.current) setSearchingMembers(false);
        });
    }, 200);
  };

  const giveLocker = async () => {
    if (!picked || !giveLockerId) return;
    setPendingId(picked.id);
    try {
      const { data } = await api.post<{ lockerNumber: string }>('/club-lockers/handoff', {
        lockerId: Number(giveLockerId),
        memberId: picked.id,
      });
      toast.success(`${ui('العضو استلم اللوكر')} ${data.lockerNumber}`);
      setPicked(null);
      setGiveLockerId('');
      setHits([]);
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setPendingId(null);
    }
  };

  const giveOptions = (memberDesk.data?.lockers ?? [])
    .filter((locker) => locker.available || locker.id === memberDesk.data?.current?.lockerId)
    .map((locker) => ({
      value: String(locker.id),
      label: locker.lockerNumber,
      description: locker.id === memberDesk.data?.current?.lockerId ? ui('مع العضو دلوقتي') : ui('فاضي'),
    }));
  const currentLockerId = memberDesk.data?.current?.lockerId;
  const choosingCurrentLocker = currentLockerId != null && giveLockerId === String(currentLockerId);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      searchController.current?.abort();
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
      searchRequest.current += 1;
      setSearchingMembers(false);
      setHits([]);
      setPicked(null);
      setGiveLockerId('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="xl" className="max-h-[88vh] overflow-y-auto" aria-describedby="locker-desk-description">
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-5 text-primary" />
            {ui('لوكرات مع الأعضاء')}
          </DialogTitle>
          <DialogDescription id="locker-desk-description">
            {ui('كل عضو لسه معاه مفتاح لوكر، بالساعة اللي استلمه فيها. تقدر تسلّم المفتاح أو تغيّر رقم اللوكر من هنا.')}
          </DialogDescription>
        </DialogHeader>

        {canManage ? (
          <section className="space-y-3 rounded-2xl border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">{ui('إعطاء لوكر لعضو')}</h3>
            <Combobox
              value={picked ? String(picked.id) : ''}
              onValueChange={(id) => {
                const hit = hits.find((row) => String(row.id) === id) ?? (picked && String(picked.id) === id ? picked : null);
                setPicked(hit);
                setGiveLockerId('');
              }}
              onSearch={searchMembers}
              options={[
                ...(picked ? [{ value: String(picked.id), label: picked.name, description: picked.memberCode, searchText: `${picked.name} ${picked.memberCode}` }] : []),
                ...hits
                  .filter((hit) => hit.id !== picked?.id)
                  .map((hit) => ({
                    value: String(hit.id),
                    label: hit.name,
                    description: hit.memberCode,
                    searchText: `${hit.name} ${hit.memberCode}`,
                  })),
              ]}
              placeholder={ui('دور بالاسم أو الكود')}
              searchPlaceholder={ui('اسم · كود · موبايل')}
              emptyText={searchingMembers ? ui('جاري البحث…') : ui('لا يوجد عضو')}
              aria-label={ui('دور بالاسم أو الكود')}
            />
            {picked ? (
              <div className="space-y-2">
                {memberDesk.data?.current ? (
                  <p className="rounded-xl bg-primary/5 px-3 py-2 text-sm text-muted-foreground" role="status">
                    {ui('العضو معاه دلوقتي لوكر رقم')}{' '}
                    <span className="nums font-semibold text-foreground">
                      {memberDesk.data.current.lockerNumber}
                    </span>
                  </p>
                ) : null}
                {memberDesk.isError ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-sm">
                    <span>{ui('تعذّر تحميل اللوكرات المتاحة.')}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      permissionAction={null}
                      onClick={() => void memberDesk.refetch()}
                    >
                      {ui('إعادة المحاولة')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 text-sm">
                      <span className="break-words font-semibold">{picked.name}</span>
                      <span className="nums ms-2 text-muted-foreground">{picked.memberCode}</span>
                    </p>
                    <div className="min-w-48 flex-1">
                      <Combobox
                        value={giveLockerId}
                        onValueChange={setGiveLockerId}
                        options={giveOptions}
                        placeholder={memberDesk.isLoading ? ui('جاري التحميل…') : ui('اختار اللوكر')}
                        searchPlaceholder={ui('دور على رقم اللوكر')}
                        emptyText={ui('مفيش لوكر فاضي')}
                        disabled={pendingId === picked.id || memberDesk.isLoading}
                        aria-label={ui('اختار اللوكر')}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="brand"
                      permissionAction={null}
                      disabled={
                        !giveLockerId ||
                        choosingCurrentLocker ||
                        pendingId === picked.id ||
                        memberDesk.isLoading
                      }
                      onClick={() => void giveLocker()}
                    >
                      {pendingId === picked.id
                        ? ui('جاري الحفظ…')
                        : currentLockerId != null
                          ? ui('تغيير اللوكر')
                          : ui('إعطاء اللوكر')}
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            {ui('لسه مرجعوش المفتاح')}
            <span className="nums ms-2 text-muted-foreground">{toArabicDigits(desk.data?.holding.length ?? 0)}</span>
          </h3>
          {desk.isLoading ? <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : null}
          {desk.isError ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 px-3 py-2 text-sm">
              <span>{ui('تعذّر تحميل اللوكرات. تحقق من الاتصال ثم أعد المحاولة.')}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void desk.refetch()}>{ui('إعادة المحاولة')}</Button>
            </div>
          ) : null}
          {!desk.isLoading && !desk.isError && (desk.data?.holding.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {ui('مفيش حد معاه لوكر دلوقتي')}
            </p>
          ) : null}
          {(desk.data?.holding ?? []).map((row) => {
            // Shared/legacy lockers follow the member; an explicit section takes priority.
            const lockerGender = row.lockerSection === 'female' || row.lockerSection === 'male'
              ? row.lockerSection
              : row.memberGender;
            const options = [
              { value: String(row.lockerId), label: row.lockerNumber, description: ui('مع العضو دلوقتي') },
              ...(desk.data?.availableLockers ?? [])
                .filter((locker) => locker.branchId === row.branchId && locker.id !== row.lockerId)
                .filter((locker) => lockerFitsMember(locker.section, row.memberGender, desk.data?.splitByGender === true))
                .map((locker) => ({ value: String(locker.id), label: locker.lockerNumber, description: ui('فاضي') })),
            ];
            return (
              <article
                key={row.handoffId}
                className={cn(
                  'flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center',
                  lockerGender === 'female' && '!border-2 !border-pink-500 dark:!border-pink-400',
                  lockerGender === 'male' && '!border-2 !border-blue-500 dark:!border-blue-400',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{row.memberName}</p>
                  <p className="nums text-xs text-muted-foreground">{row.memberCode}</p>
                  <p className="mt-1 text-sm">
                    {ui('لوكر رقم')} <span className="nums font-semibold">{row.lockerNumber}</span>
                    {lockerGender === 'female' || lockerGender === 'male' ? (
                      <span className="ms-2 text-xs text-muted-foreground">
                        · {ui(lockerGender === 'female' ? 'حريمي' : 'رجالي')}
                      </span>
                    ) : null}
                  </p>
                </div>
                <p className="nums text-sm font-medium text-primary">
                  {ui('استلم الساعة')} {clock(row.assignedAt)}
                </p>
                {canManage ? (
                  <div className="min-w-44">
                    <Combobox
                      value={String(row.lockerId)}
                      onValueChange={(value) => void changeLocker(row, value)}
                      options={options}
                      placeholder={ui('تغيير اللوكر')}
                      searchPlaceholder={ui('دور على رقم اللوكر')}
                      emptyText={ui('مفيش لوكر فاضي')}
                      disabled={pendingId === row.memberId}
                      aria-label={ui('تغيير اللوكر')}
                    />
                  </div>
                ) : null}
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    permissionAction={null}
                    disabled={pendingId === row.memberId}
                    onClick={() => void release(row)}
                  >
                    {pendingId === row.memberId ? ui('جاري التسليم…') : ui('تسليم اللوكر')}
                  </Button>
                ) : null}
              </article>
            );
          })}
        </section>
      </DialogContent>
    </Dialog>
  );
}

/** Locker picker inside the open member card at reception. */
export function MemberLockerAssign({ memberId }: { memberId: number }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const desk = useQuery({
    queryKey: ['locker-desk', memberId],
    queryFn: async () => (await api.get<DeskResponse>('/club-lockers/desk', { params: { memberId } })).data,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['locker-desk', memberId] });
    await qc.invalidateQueries({ queryKey: ['locker-open-handoffs'] });
    await qc.invalidateQueries({ queryKey: ['club-lockers'] });
    await qc.invalidateQueries({ queryKey: ['club-member-profile-summary'] });
  };

  const assign = async (lockerId: string) => {
    if (!lockerId || lockerId === String(desk.data?.current?.lockerId ?? '')) return;
    setPending(true);
    try {
      const { data } = await api.post<{ lockerNumber: string }>('/club-lockers/handoff', {
        lockerId: Number(lockerId),
        memberId,
      });
      toast.success(`${ui('العضو استلم اللوكر')} ${data.lockerNumber}`);
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setPending(false);
    }
  };

  const release = async () => {
    setPending(true);
    try {
      await api.post('/club-lockers/handoff/release', { memberId });
      toast.success(ui('تم تسليم اللوكر'));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setPending(false);
    }
  };

  const options = (desk.data?.lockers ?? [])
    .filter((locker) => locker.available || locker.id === desk.data?.current?.lockerId)
    .map((locker) => ({
      value: String(locker.id),
      label: locker.lockerNumber,
      description: locker.id === desk.data?.current?.lockerId ? ui('مع العضو دلوقتي') : ui('فاضي'),
    }));

  return (
    <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl border bg-muted/30 px-2.5 py-1.5">
      <Lock className="size-4 shrink-0 text-primary" />
      <span className="shrink-0 text-sm font-semibold">
        {ui('اللوكر')}
        {desk.data?.section === 'female' ? ` · ${ui('حريمي')}` : desk.data?.section === 'male' ? ` · ${ui('رجالي')}` : ''}
      </span>
      <div className="min-w-32 flex-1">
        <Combobox
          value={desk.data?.current ? String(desk.data.current.lockerId) : ''}
          onValueChange={(value) => void assign(value)}
          options={options}
          placeholder={desk.isLoading ? ui('جاري التحميل…') : ui('اختار اللوكر')}
          searchPlaceholder={ui('دور على رقم اللوكر')}
          emptyText={
            desk.data?.section === 'female'
              ? ui('مفيش لوكر حريمي فاضي')
              : desk.data?.section === 'male'
                ? ui('مفيش لوكر رجالي فاضي')
                : ui('مفيش لوكر فاضي')
          }
          disabled={pending || desk.isLoading}
          aria-label={ui('اختار اللوكر')}
        />
      </div>
      {desk.data?.current ? (
        <Button type="button" variant="outline" size="sm" permissionAction={null} disabled={pending} onClick={() => void release()}>
          {ui('تسليم')}
        </Button>
      ) : null}
    </div>
  );
}
