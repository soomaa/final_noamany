import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Archive, Briefcase, Building2, Copy, ExternalLink, FileText, Loader2, LockKeyhole, LogIn, LogOut, MoreHorizontal, Pencil, Phone, Plus, RefreshCw, Smartphone, Trash2, Undo2, User, UserCheck, UserX, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { ClubStatCard } from '@/components/club/stat-card';
import {
  AttendanceSummaryCards,
  useClubAttendanceStatistics,
} from '@/components/club/attendance-summary-cards';
import {
  MemberOnboardingGuide,
  useFirstVisitGuide,
} from '@/components/club/member-onboarding-guide';
import { MemberCell } from '@/components/club/member-cell';
import { DialogFormGrid, DialogFormSection, DialogFormToggle, FormDialogBody, FormDialogFooter, FormDialogHeader, FORM_DIALOG_CONTENT_CLASS } from '@/components/common/dialog-form-layout';
import { FieldWrapper } from '@/components/common/form-fields';
import { UploadField } from '@/components/employees/upload-fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { buildMemberDocumentFormData } from '@/lib/member-document-model';
import { formatDateTime, formatMoney, formatTimeFromDate, localToday } from '@/lib/formatters';
import {
  useArrayResource,
  usePaginatedList,
} from '@/lib/api-hooks';
import { confirm, afterMenuClose } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import type { ClubMembersView } from '@/lib/club-routes';
import type {
  ClubMemberCreateResponse,
  ClubMemberFormData,
  ClubMemberListItem,
  ClubMemberStatistics,
  ClubMembershipType,
} from '@/types/club';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const MEMBER_PHONE_FORMAT_ERROR = 'رقم الموبايل غير صحيح — يجب أن يكون 11 رقمًا';

type MemberDocument = {
  id: number;
  type: string;
  label: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: string;
  downloadUrl: string;
};

function normalizeMemberPhone(phone: string) {
  return phone.trim().replace(/[\s\-()+]/g, '');
}

const EMPTY_FORM: ClubMemberFormData = {
  branchId: 0,
  name: '',
  phone: '',
  gender: 'male',
  cardNumber: '',
  email: '',
  dateOfBirth: '',
  address: '',
  maritalStatus: '',
  jobTitle: '',
  profilePicture: '',
  notes: '',
  isActive: true,
  salesId: undefined,
  employeeId: undefined,
  guardianName: '',
  guardianPhone: '',
  autoCreateUser: true,
};

function resolveBranchName(
  branches: { id: number; name: string | null }[] | undefined,
  branchId: number,
  userBranchId?: number,
  userBranchName?: string | null,
): string {
  if (!branchId) return '—';
  const name = branches?.find((b) => b.id === branchId)?.name?.trim();
  if (name) return name;
  if (userBranchName?.trim() && userBranchId === branchId) return userBranchName.trim();
  return branches === undefined ? '…' : `فرع رقم ${toArabicDigits(branchId)}`;
}

function blockedMemberDetails(notes: string | null | undefined) {
  if (!notes) return { reason: null, date: null };
  const matches = [...notes.matchAll(/\[legacy-block:\d+\]\s*([^\n—]*?)\s*—\s*([^\n]+)/g)];
  const last = matches.at(-1);
  if (!last) return { reason: notes, date: null };
  return {
    date: last[1]?.trim() || null,
    reason: last[2]?.trim() || null,
  };
}

interface AttendanceRow {
  id: number;
  memberName: string;
  memberCode: string;
  attendanceDate: string;
  checkInTime: string;
  status: string;
  duration: number | null;
  branchId: number;
}

interface DailyAttendanceRow {
  date: string;
  memberId: number;
  memberName: string;
  memberCode: string;
  entries: number;
  totalDuration: number;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  branchId: number;
}

interface MemberDeletionRefundPreview {
  subscriptionId: number;
  stopDate: string;
  remainingDays: number;
  remainingSessions: number | null;
  refundBasis: 'days' | 'sessions';
  refundAmount: number;
  consumedValue: number;
  paidAmount: number;
}

interface MemberDeletionSubscription {
  id: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  status: string;
  startDate: string;
  endDate: string;
  paidAmount: number;
  remainingAmount: number;
  receiptTotal: number;
  refundedTotal: number;
  receipts: Array<{
    id: number;
    receiptNumber: string;
    amount: number;
    receiptDate: string;
    paymentMethod: string | null;
  }>;
  refunds: Array<{
    id: number;
    invoiceNumber: string;
    amount: number;
    refundDate: string;
    status: string;
  }>;
  refundPreview: MemberDeletionRefundPreview | null;
  refundUnavailableReason: string | null;
  requiresRefund: boolean;
}

interface MemberDeletionPreview {
  member: { id: number; memberCode: string; name: string };
  stopDate: string;
  subscriptions: MemberDeletionSubscription[];
  otherFinancialItems: Array<{
    kind: string;
    label: string;
    count: number;
    amount: number;
  }>;
  totals: {
    receipts: number;
    refunded: number;
    refundable: number;
  };
  hasFinancialHistory: boolean;
  requiresRefund: boolean;
  archiveKeepsFinancialHistory: boolean;
}

export interface ClubMembersPageProps {
  singleView?: ClubMembersView;
  openCreateOnMount?: boolean;
}

export function ClubMembersPage({ singleView, openCreateOnMount }: ClubMembersPageProps = {}) {
  const ct = useClubT();
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreateMembers = can('club.members:create');
  const canUpdateMembers = can('club.members:update');
  const canDeleteMembers = can('club.members:delete');
  const { user } = useAuth();
  const isSystemAdmin = user?.level === 1;
  const memberOnboarding = useFirstVisitGuide('members', user?.sub);
  const genderOptions = useMemo(
    () => [
      { value: 'male', label: ct('common.male') },
      { value: 'female', label: ct('common.female') },
    ],
    [ct],
  );
  const [tab, setTab] = useState<ClubMembersView>(singleView ?? 'members');
  const [memberListMode, setMemberListMode] = useState<'all' | 'blocked'>('all');
  const { params, setParams } = useListQuery();
  const memberListParams = useMemo(
    () => ({
      ...params,
      filters: {
        ...params.filters,
        status: memberListMode === 'blocked' ? 'inactive' : 'active',
      },
    }),
    [memberListMode, params],
  );
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClubMemberListItem>(
    'club-members',
    memberListParams,
  );
  const { data: branches } = useBranches();
  const { data: membershipTypes } = useArrayResource<ClubMembershipType>('club-membership-types');
  const { data: salesReps } = useQuery({
    queryKey: ['employees', 'sales-reps'],
    queryFn: async () => {
      const { data } = await api.get<Array<{ id: number; name: string | null; empCode: number | null }>>('/employees/sales-reps');
      return data;
    },
  });
  const salesRepOptions = useMemo(
    () => (salesReps ?? []).map((e) => ({ value: String(e.id), label: e.name ?? `#${e.id}` })),
    [salesReps],
  );
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { id: memberIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const attParams = useListQuery({ pageSize: 20 });
  const [attendanceStartDate, setAttendanceStartDate] = useState(() => localToday());
  const [attendanceEndDate, setAttendanceEndDate] = useState(() => localToday());
  const [attendanceBranch, setAttendanceBranch] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState<'all' | 'checked_in' | 'checked_out'>('all');
  const effectiveAttendanceBranch = isSystemAdmin
    ? attendanceBranch
    : user?.branch
      ? String(user.branch)
      : '';
  const attendanceListParams = useMemo(
    () => ({
      ...attParams.params,
      filters: {
        ...attParams.params.filters,
        startDate: attendanceStartDate,
        endDate: attendanceEndDate,
        branch: effectiveAttendanceBranch,
        status: attendanceStatus,
      },
    }),
    [attParams.params, attendanceStartDate, attendanceEndDate, effectiveAttendanceBranch, attendanceStatus],
  );
  const {
    data: attendance,
    isLoading: attLoading,
    isError: attError,
    refetch: refetchAttendance,
  } = usePaginatedList<AttendanceRow>('club-attendance', attendanceListParams);
  const [attView, setAttView] = useState<'all' | 'daily'>('all');
  const dailyParams = useListQuery({ pageSize: 20 });
  const dailyAttendanceListParams = useMemo(
    () => ({
      ...dailyParams.params,
      filters: {
        ...dailyParams.params.filters,
        startDate: attendanceStartDate,
        endDate: attendanceEndDate,
        branch: effectiveAttendanceBranch,
        status: attendanceStatus,
      },
    }),
    [dailyParams.params, attendanceStartDate, attendanceEndDate, effectiveAttendanceBranch, attendanceStatus],
  );
  const {
    data: dailyAttendance,
    isLoading: dailyLoading,
    isError: dailyError,
    refetch: refetchDaily,
  } = usePaginatedList<DailyAttendanceRow>(
    'club-attendance/daily-summary',
    dailyAttendanceListParams,
    attView === 'daily',
  );
  const [financialCode, setFinancialCode] = useState('');
  const { data: financial, refetch: refetchFinancial, isFetching: financialLoading } = useQuery({
    queryKey: ['club-members', 'financial', financialCode],
    queryFn: async () => {
      const q = financialCode.trim();
      const { data: list } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
        params: { search: q, pageSize: 5 },
      });
      const exact = list.data.find((m) => m.memberCode === q || m.cardNumber === q);
      if (!exact) {
        toast.error(ct('members.noMemberFound'));
        throw new Error('Member not found');
      }
      const { data: f } = await api.get<{
        summary: {
          totalSubscriptions: number;
          totalPaidOnSubscriptions: number;
          totalRemaining: number;
        };
        timeline: Array<{
          kind: 'subscription' | 'receipt';
          sortDate: string;
          data: { subscriptionNumber?: string; receiptNumber?: string; paidAmount?: number; amount?: number };
        }>;
      }>(`/club-members/${exact.id}/financial-history`);
      return f;
    },
    enabled: false,
  });
  const { data: stats } = useQuery({
    queryKey: ['club-members', 'statistics'],
    queryFn: async () => {
      const { data: s } = await api.get<ClubMemberStatistics>('/club-members/statistics');
      return s;
    },
  });
  const { data: attStats } = useClubAttendanceStatistics(
    {
      startDate: attendanceStartDate,
      endDate: attendanceEndDate,
      branch: effectiveAttendanceBranch || undefined,
    },
    { enabled: tab === 'attendance' || singleView === 'attendance' },
  );

  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const filters: FilterField[] = [
    { key: 'branch', label: ct('common.branch'), type: 'select', options: branchOptions },
    { key: 'gender', label: ct('members.gender'), type: 'select', options: genderOptions },
  ];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ClubMemberFormData>(EMPTY_FORM);
  const [phoneValidationError, setPhoneValidationError] = useState<string | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  const formBranchName = useMemo(
    () => resolveBranchName(branches, form.branchId, user?.branch, user?.branch_name),
    [branches, form.branchId, user?.branch, user?.branch_name],
  );

  const [saving, setSaving] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ username: string; password: string } | null>(null);
  const [undoMemberId, setUndoMemberId] = useState<number | null>(null);
  const [editMemberCode, setEditMemberCode] = useState('');
  const [membershipDocuments, setMembershipDocuments] = useState<MemberDocument[]>([]);
  const [documentType, setDocumentType] = useState('other');
  const [memberDocumentUploading, setMemberDocumentUploading] = useState(false);
  const [previewMemberCode, setPreviewMemberCode] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ClubMemberListItem | null>(null);
  const [deletePreview, setDeletePreview] = useState<MemberDeletionPreview | null>(null);
  const [deleteStopDate, setDeleteStopDate] = useState(localToday());
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deletingMember, setDeletingMember] = useState(false);
  const [refundingSubscriptionId, setRefundingSubscriptionId] = useState<number | 'all' | null>(null);

  const [checkInCode, setCheckInCode] = useState('');
  const [checkInLoading, setCheckInLoading] = useState(false);
  const checkInRef = useRef<HTMLInputElement>(null);
  const didAutoOpenCreate = useRef(false);
  const saveMemberInFlight = useRef(false);
  const openedDocumentMember = useRef<string | null>(null);

  const openCreate = () => {
    if (!canCreateMembers) return;
    const branchId = !isSystemAdmin && user?.branch && user.branch > 0 ? user.branch : 0;
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      branchId,
      employeeId: user?.emp_code ?? undefined,
    });
    setGeneratedCredentials(null);
    setPhoneValidationError(null);
    setUndoMemberId(null);
    setEditMemberCode('');
    setMembershipDocuments([]);
    setPreviewMemberCode('');
    setDialogOpen(true);
  };

  useEffect(() => {
    if (!openCreateOnMount || !canCreateMembers || didAutoOpenCreate.current) return;
    didAutoOpenCreate.current = true;
    openCreate();
  }, [openCreateOnMount, canCreateMembers]);

  useEffect(() => {
    if (!dialogOpen || editId || isSystemAdmin) return;
    const branchId = user?.branch && user.branch > 0 ? user.branch : 0;
    if (branchId > 0 && form.branchId !== branchId) {
      setForm((f) => ({ ...f, branchId }));
    }
  }, [dialogOpen, editId, isSystemAdmin, user?.branch, form.branchId]);

  useEffect(() => {
    if (!dialogOpen || editId) return;
    if (!form.branchId) {
      setPreviewMemberCode('');
      return;
    }
    let cancelled = false;
    void api
      .get<{ memberCode: string }>('/club-members/next-code', { params: { branchId: form.branchId } })
      .then(({ data }) => {
        if (!cancelled) setPreviewMemberCode(data.memberCode);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewMemberCode('');
        toast.error(ct('members.codePreviewFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, editId, form.branchId, ct]);

  useEffect(() => {
    if (!dialogOpen) {
      setPhoneValidationError(null);
      setCheckingPhone(false);
      return;
    }

    const phone = normalizeMemberPhone(form.phone);
    if (!phone) {
      setPhoneValidationError(null);
      setCheckingPhone(false);
      return;
    }
    if (!/^\d{11}$/.test(phone)) {
      setPhoneValidationError(MEMBER_PHONE_FORMAT_ERROR);
      setCheckingPhone(false);
      return;
    }
    if (!form.branchId) return;

    let cancelled = false;
    setCheckingPhone(true);
    const checkTimer = window.setTimeout(() => {
      void api
        .get<{ hasDuplicates: boolean; duplicates: Array<{ field: string }> }>('/club-members/check-duplicate', {
          params: { phone, branchId: form.branchId, excludeMemberId: editId ?? undefined },
        })
        .then(({ data }) => {
          if (cancelled) return;
          setPhoneValidationError(
            data.hasDuplicates && data.duplicates.some((duplicate) => duplicate.field === 'phone')
              ? 'الرقم مسجل من قبل'
              : null,
          );
        })
        .catch(() => {
          if (!cancelled) setPhoneValidationError(null);
        })
        .finally(() => {
          if (!cancelled) setCheckingPhone(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(checkTimer);
    };
  }, [dialogOpen, editId, form.branchId, form.phone]);

  const openEdit = (row: ClubMemberListItem) => {
    if (!canUpdateMembers) return;
    setEditId(row.id);
    setForm({
      branchId: row.branchId,
      name: row.name,
      phone: row.phone ?? '',
      gender: row.gender,
      cardNumber: row.cardNumber ?? '',
      email: row.email ?? '',
      dateOfBirth: row.dateOfBirth ?? '',
      address: row.address ?? '',
      maritalStatus: row.maritalStatus ?? '',
      jobTitle: row.jobTitle ?? '',
      profilePicture: row.profilePicture ?? '',
      notes: row.notes ?? '',
      isActive: row.isActive,
      salesId: row.salesId ?? undefined,
      employeeId: row.employeeId ?? undefined,
      guardianName: row.guardianName ?? '',
      guardianPhone: row.guardianPhone ?? '',
      autoCreateUser: false,
    });
    setGeneratedCredentials(null);
    setPhoneValidationError(null);
    setUndoMemberId(null);
    setEditMemberCode(row.memberCode);
    setMembershipDocuments([]);
    setDialogOpen(true);
  };

  useEffect(() => {
    if (searchParams.get('tab') !== 'documents' || !memberIdParam || !canUpdateMembers || openedDocumentMember.current === memberIdParam) return;
    const memberId = Number(memberIdParam);
    if (!Number.isInteger(memberId) || memberId < 1) return;
    openedDocumentMember.current = memberIdParam;
    void api.get<ClubMemberListItem>(`/club-members/${memberId}`).then(({ data: member }) => openEdit(member)).catch(() => toast.error('تعذر فتح مستندات العضو'));
  }, [memberIdParam, searchParams, canUpdateMembers]);

  useEffect(() => {
    if (!dialogOpen || !editId) return;
    let cancelled = false;
    void api.get<MemberDocument[]>(`/club-members/${editId}/membership-documents`)
      .then(({ data: documents }) => { if (!cancelled) setMembershipDocuments(documents); })
      .catch(() => { if (!cancelled) setMembershipDocuments([]); });
    return () => { cancelled = true; };
  }, [dialogOpen, editId]);

  const addMemberDocument = async (file: File | null) => {
    if (!editId || !file) return;
    setMemberDocumentUploading(true);
    try {
      const body = buildMemberDocumentFormData(file, documentType, file.name);
      const { data } = await api.post<MemberDocument>(`/club-members/${editId}/membership-documents`, body);
      setMembershipDocuments((current) => [data, ...current]);
      toast.success('تمت إضافة المستند إلى ملف العضو');
    } catch (error) {
      toast.error(apiError(error, 'تعذر حفظ المستند'));
    } finally {
      setMemberDocumentUploading(false);
    }
  };

  const openMemberDocument = async (document: MemberDocument) => {
    try {
      const { data } = await api.get<Blob>(document.downloadUrl, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(data);
      const link = window.document.createElement('a');
      link.href = objectUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast.error(apiError(error, 'تعذر فتح المستند'));
    }
  };

  const removeMemberDocument = async (documentId: number) => {
    if (!editId) return;
    try {
      await api.delete(`/club-members/${editId}/membership-documents/${documentId}`);
      setMembershipDocuments((current) => current.filter((document) => document.id !== documentId));
      toast.success('تم حذف المستند من ملف العضو');
    } catch (error) {
      toast.error(apiError(error, 'تعذر حذف المستند'));
    }
  };

  const saveMember = async (nextStep: 'none' | 'subscription' = 'none') => {
    if (editId ? !canUpdateMembers : !canCreateMembers) return;
    // `saving` is rendered asynchronously. A synchronous ref closes the tiny window
    // where a double-click/Enter can submit the same new member twice before React
    // disables the buttons, which used to surface as "already registered".
    if (saveMemberInFlight.current) return;
    if (!form.name.trim()) {
      toast.error(ct('members.nameRequired'));
      return;
    }
    if (!form.phone.trim()) {
      toast.error(ct('members.phoneRequired'));
      return;
    }
    if (!/^\d{11}$/.test(normalizeMemberPhone(form.phone))) {
      toast.error(MEMBER_PHONE_FORMAT_ERROR);
      return;
    }

    const branchId =
      form.branchId > 0
        ? form.branchId
        : user?.branch && user.branch > 0
          ? user.branch
          : 0;
    if (!branchId) {
      toast.error(ct('members.branchRequired'));
      return;
    }

    const cardNumber = form.cardNumber.trim();

    saveMemberInFlight.current = true;
    setSaving(true);
    try {
      const dupRes = await api.get('/club-members/check-duplicate', {
        params: {
          phone: form.phone,
          branchId,
          ...(cardNumber ? { cardNumber } : {}),
          excludeMemberId: editId ?? undefined,
        },
      });
      if (dupRes.data.hasDuplicates) {
        toast.error(dupRes.data.message ?? ct('members.duplicateData'));
        setSaving(false);
        return;
      }

      const payload = {
        ...form,
        branchId,
        ...(cardNumber ? { cardNumber } : {}),
        email: form.email || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        address: form.address || undefined,
        maritalStatus: form.maritalStatus || undefined,
        jobTitle: form.jobTitle || undefined,
        profilePicture: form.profilePicture || undefined,
        notes: form.notes || undefined,
        salesId: form.salesId || undefined,
        guardianName: form.guardianName || undefined,
        guardianPhone: form.guardianPhone || undefined,
        autoCreateUser: form.autoCreateUser,
      };

      if (editId) {
        await api.put(`/club-members/${editId}`, payload);
        toast.success(ct('members.memberUpdated'));
        setDialogOpen(false);
      } else {
        const { data: created } = await api.post<ClubMemberCreateResponse>('/club-members', payload);
        if (nextStep !== 'none' && created.member?.id) {
          // Save once, then continue with the chosen subscription workflow using the same member.
          if (created.generatedCredentials) {
            toast.success(
              `${ct('members.memberAdded')} — ${ct('members.appUsername')}: ${created.generatedCredentials.username} / ${created.generatedCredentials.password}`,
              { duration: 12000 },
            );
          } else {
            toast.success(ct('members.memberAdded'));
          }
          void qc.invalidateQueries({ queryKey: ['club-members'] });
          void qc.invalidateQueries({ queryKey: ['club-members', 'dropdown'] });
          setDialogOpen(false);
          navigate('/club/subscriptions/new', { state: { prefillMember: created.member } });
          return;
        }
        toast.success(ct('members.memberAdded'), {
          duration: 10000,
          ...(canDeleteMembers
            ? {
                action: {
                  label: ct('common.undo') ?? ui('تراجع'),
                  onClick: () => {
                    if (created.member?.id) {
                      setUndoMemberId(created.member.id);
                      void api.delete(`/club-members/${created.member.id}`).then(() => {
                        toast.success(ct('members.memberUndone'));
                        void qc.invalidateQueries({ queryKey: ['club-members'] });
                      });
                    }
                  },
                },
              }
            : {}),
        });
        if (created.generatedCredentials) {
          setGeneratedCredentials(created.generatedCredentials);
        }
      }
      void qc.invalidateQueries({ queryKey: ['club-members'] });
      void qc.invalidateQueries({ queryKey: ['club-members', 'dropdown'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      saveMemberInFlight.current = false;
      setSaving(false);
    }
  };

  const loadDeletionPreview = async (memberId: number, stopDate: string) => {
    setDeletePreviewLoading(true);
    try {
      const { data: preview } = await api.get<MemberDeletionPreview>(
        `/club-members/${memberId}/deletion-preview`,
        { params: { stopDate } },
      );
      setDeletePreview(preview);
    } catch (error) {
      setDeletePreview(null);
      toast.error(apiError(error));
    } finally {
      setDeletePreviewLoading(false);
    }
  };

  const handleDelete = async (row: ClubMemberListItem) => {
    if (!canDeleteMembers) return;
    const stopDate = localToday();
    setDeleteTarget(row);
    setDeletePreview(null);
    setDeleteStopDate(stopDate);
    void loadDeletionPreview(row.id, stopDate);
  };

  const refundDeletionSubscription = async (subscription: MemberDeletionSubscription) => {
    const refund = subscription.refundPreview;
    if (!deleteTarget || !refund || refund.refundAmount <= 0) return;

    const ok = await confirm({
      title: ui('تأكيد استرداد الاشتراك'),
      description: ui('سيتم صرف المبلغ من الخزينة وإنهاء هذا الاشتراك مع الاحتفاظ بالإيصالات.'),
      confirmLabel: ui('استرداد المبلغ'),
      variant: 'destructive',
      rows: [
        { label: ui('الاشتراك'), after: subscription.subscriptionNumber },
        { label: ui('المدفوع'), after: formatMoney(subscription.paidAmount) },
        { label: ui('قيمة الاستهلاك'), after: formatMoney(refund.consumedValue) },
        { label: ui('المبلغ المسترد'), after: formatMoney(refund.refundAmount) },
      ],
    });
    if (!ok) return;

    setRefundingSubscriptionId(subscription.id);
    try {
      await api.post('/club-subscription-refunds', {
        subscriptionId: subscription.id,
        stopDate: refund.stopDate,
        reason: 'إلغاء عضوية',
        notes: `استرداد من نافذة حذف العضو ${deleteTarget.memberCode}`,
      });
      toast.success(ui('تم استرداد المبلغ وإنهاء الاشتراك'));
      await loadDeletionPreview(deleteTarget.id, deleteStopDate);
      void qc.invalidateQueries({ queryKey: ['club-subscriptions'] });
      void qc.invalidateQueries({ queryKey: ['club-subscription-refunds'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setRefundingSubscriptionId(null);
    }
  };

  const refundAllDeletionSubscriptions = async () => {
    if (!deleteTarget || !deletePreview) return;
    const refundable = deletePreview.subscriptions.filter(
      (subscription) =>
        subscription.requiresRefund &&
        subscription.refundPreview &&
        subscription.refundPreview.refundAmount > 0,
    );
    if (refundable.length === 0) return;

    const ok = await confirm({
      title: ui('استرداد كل المبالغ'),
      description: ui('سيتم تنفيذ استرداد مستقل لكل اشتراك ثم تحديث ملخص حذف العضو.'),
      confirmLabel: ui('استرداد الكل'),
      variant: 'destructive',
      rows: [
        { label: ui('عدد الاشتراكات'), after: String(refundable.length) },
        { label: ui('إجمالي الاسترداد'), after: formatMoney(deletePreview.totals.refundable) },
      ],
    });
    if (!ok) return;

    setRefundingSubscriptionId('all');
    let completed = 0;
    try {
      for (const subscription of refundable) {
        const refund = subscription.refundPreview!;
        await api.post('/club-subscription-refunds', {
          subscriptionId: subscription.id,
          stopDate: refund.stopDate,
          reason: 'إلغاء عضوية',
          notes: `استرداد من نافذة حذف العضو ${deleteTarget.memberCode}`,
        });
        completed += 1;
      }
      toast.success(ui('تم استرداد كل المبالغ المطلوبة'));
    } catch (error) {
      toast.error(
        completed > 0
          ? `${ui('تم تنفيذ بعض الاستردادات ثم توقف التنفيذ')}: ${apiError(error)}`
          : apiError(error),
      );
    } finally {
      await loadDeletionPreview(deleteTarget.id, deleteStopDate);
      setRefundingSubscriptionId(null);
      void qc.invalidateQueries({ queryKey: ['club-subscriptions'] });
      void qc.invalidateQueries({ queryKey: ['club-subscription-refunds'] });
    }
  };

  const finishMemberDeletion = async () => {
    if (!canDeleteMembers) return;
    if (!deleteTarget || !deletePreview || deletePreview.requiresRefund) return;
    const willArchive = deletePreview.hasFinancialHistory;
    const ok = await confirm({
      title: willArchive ? ui('أرشفة العضو') : ct('members.deleteMember'),
      description: willArchive
        ? ui('سيختفي العضو من القوائم وتتوقف خدماته، مع الاحتفاظ بكل الإيصالات والسجل المالي والتدقيق.')
        : ct('members.deleteMemberDesc', { name: deleteTarget.name }),
      confirmLabel: willArchive ? ui('أرشفة وإنهاء') : ct('common.delete'),
      variant: 'destructive',
      rows: willArchive
        ? [
            { label: ui('العضو'), after: `${deleteTarget.name} — ${deleteTarget.memberCode}` },
            { label: ui('إجمالي الإيصالات'), after: formatMoney(deletePreview.totals.receipts) },
            { label: ui('إجمالي المسترد'), after: formatMoney(deletePreview.totals.refunded) },
          ]
        : undefined,
    });
    if (!ok) return;

    setDeletingMember(true);
    try {
      await api.delete(`/club-members/${deleteTarget.id}`);
      toast.success(
        willArchive
          ? ui('تمت أرشفة العضو مع الاحتفاظ بالسجل المالي')
          : ct('common.success'),
      );
      setDeleteTarget(null);
      setDeletePreview(null);
      void qc.invalidateQueries({ queryKey: ['club-members'] });
      void qc.invalidateQueries({ queryKey: ['club-members', 'dropdown'] });
      void qc.invalidateQueries({ queryKey: ['club-members', 'statistics'] });
      void qc.invalidateQueries({ queryKey: ['club-subscriptions'] });
    } catch (error) {
      toast.error(apiError(error));
      await loadDeletionPreview(deleteTarget.id, deleteStopDate);
    } finally {
      setDeletingMember(false);
    }
  };

  const handleCheckIn = async () => {
    const code = checkInCode.trim();
    if (!code) {
      toast.error(ct('members.enterCode'));
      return;
    }
    setCheckInLoading(true);
    try {
      const { data: list } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
        params: { search: code, pageSize: 5 },
      });
      const exact = list.data.find((m) => m.memberCode === code || m.cardNumber === code);
      if (!exact) {
        toast.error(ct('members.noMemberFound'));
        setCheckInLoading(false);
        return;
      }
      await api.post('/club-attendance/check-in', { memberId: exact.id, consumeSession: true });
      toast.success(ct('members.checkInNamed', { name: exact.name }));
      setCheckInCode('');
      checkInRef.current?.focus();
      void qc.invalidateQueries({ queryKey: ['club-attendance'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleCheckOut = async (attendanceId: number) => {
    try {
      await api.post('/club-attendance/check-out', { attendanceId });
      toast.success(ct('members.checkedOut'));
      void qc.invalidateQueries({ queryKey: ['club-attendance'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const unblockMember = async (member: ClubMemberListItem) => {
    if (!canUpdateMembers) return;
    const ok = await confirm({
      title: ui('إلغاء حظر العضو'),
      description: ui('سيعود العضو إلى قائمة جميع الأعضاء ويمكنه استخدام خدمات النادي حسب صلاحية اشتراكه.'),
      confirmLabel: ui('إلغاء الحظر'),
      rows: [{ label: ui('العضو'), after: `${member.name} — ${member.memberCode}` }],
    });
    if (!ok) return;
    try {
      await api.put(`/club-members/${member.id}`, { isActive: true });
      toast.success(ui('تم إلغاء حظر العضو'));
      void qc.invalidateQueries({ queryKey: ['club-members'] });
      void qc.invalidateQueries({ queryKey: ['club-members', 'statistics'] });
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const columns = useMemo<ColumnDef<ClubMemberListItem>[]>(
    () => [
      {
        accessorKey: 'memberCode',
        header: ct('members.memberCode'),
        cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span>,
      },
      {
        accessorKey: 'name',
        header: ct('members.name'),
        cell: ({ row }) => (
          <MemberCell
            name={row.original.name}
            code={row.original.memberCode}
            profilePicture={row.original.profilePicture}
            showCode={false}
          />
        ),
      },
      {
        accessorKey: 'phone',
        header: ct('members.phone'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        accessorKey: 'gender',
        header: ct('members.gender'),
        cell: ({ getValue }) => (getValue() === 'male' ? ct('common.male') : ct('common.female')),
      },
      {
        accessorKey: 'createdAt',
        header: ui('تاريخ تسجيل العضو'),
        cell: ({ getValue }) => {
          const value = getValue() as string | null | undefined;
          return value ? <span className="whitespace-nowrap nums">{formatDateTime(value)}</span> : '—';
        },
      },
      {
        accessorKey: 'lastCheckIn',
        header: ui('آخر دخول للجيم'),
        cell: ({ getValue }) => {
          const value = getValue() as string | null | undefined;
          return value ? <span className="whitespace-nowrap nums">{formatDateTime(value)}</span> : <span className="text-muted-foreground">{ui('لم يحضر بعد')}</span>;
        },
      },
      {
        accessorKey: 'isActive',
        header: ct('common.status'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.isActive ? 'active' : 'suspended'} />
        ),
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => !canUpdateMembers && !canDeleteMembers ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={ct('common.actions')}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdateMembers ? (
                <DropdownMenuItem onSelect={() => afterMenuClose(() => openEdit(row.original))}>
                  <Pencil className="size-4" /> {ct('common.edit')}
                </DropdownMenuItem>
              ) : null}
              {canUpdateMembers && canDeleteMembers ? <DropdownMenuSeparator /> : null}
              {canDeleteMembers ? (
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => afterMenuClose(() => void handleDelete(row.original))}
                >
                  <Trash2 className="size-4" /> {ct('common.delete')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [ct, ui, canUpdateMembers, canDeleteMembers],
  );

  const blockedColumns = useMemo<ColumnDef<ClubMemberListItem>[]>(
    () => [
      {
        accessorKey: 'memberCode',
        header: ct('members.memberCode'),
        cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span>,
      },
      {
        accessorKey: 'name',
        header: ct('members.name'),
        cell: ({ row }) => (
          <MemberCell
            name={row.original.name}
            code={row.original.memberCode}
            profilePicture={row.original.profilePicture}
            showCode={false}
          />
        ),
      },
      {
        accessorKey: 'phone',
        header: ct('members.phone'),
        cell: ({ getValue }) => {
          const value = getValue() as string | null;
          return value ? <span className="nums">{toArabicDigits(value)}</span> : '—';
        },
      },
      {
        accessorKey: 'gender',
        header: ct('members.gender'),
        cell: ({ getValue }) => getValue() === 'male' ? ct('common.male') : ct('common.female'),
      },
      {
        id: 'blockDate',
        header: ui('تاريخ الحظر'),
        cell: ({ row }) => {
          const details = blockedMemberDetails(row.original.notes);
          return <span className="nums whitespace-nowrap">{details.date ?? (row.original.updatedAt ? formatDateTime(row.original.updatedAt) : '—')}</span>;
        },
      },
      {
        id: 'blockReason',
        header: ui('سبب الحظر'),
        cell: ({ row }) => {
          const reason = blockedMemberDetails(row.original.notes).reason;
          return <span className="block min-w-48 max-w-80 whitespace-normal">{reason ?? ui('لم يُسجل سبب')}</span>;
        },
      },
      {
        id: 'branch',
        header: ct('common.branch'),
        cell: ({ row }) => resolveBranchName(branches, row.original.branchId, user?.branch, user?.branch_name),
      },
      {
        id: 'status',
        header: ct('common.status'),
        cell: () => <StatusBadge status="suspended" label={ui('محظور')} />,
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {canUpdateMembers ? (
              <Button size="sm" variant="outline" onClick={() => void unblockMember(row.original)}>
                <UserCheck className="size-4" /> {ui('إلغاء الحظر')}
              </Button>
            ) : null}
            {canUpdateMembers ? (
              <Button size="sm" variant="ghost" onClick={() => openEdit(row.original)}>
                <Pencil className="size-4" /> {ct('common.edit')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [branches, canUpdateMembers, ct, ui, user?.branch, user?.branch_name],
  );

  const attColumns = useMemo<ColumnDef<AttendanceRow>[]>(
    () => [
      { accessorKey: 'memberName', header: ct('members.name') },
      { accessorKey: 'memberCode', header: ct('members.memberCode'), cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span> },
      ...(isSystemAdmin
        ? [{
            id: 'branch',
            header: ct('common.branch'),
            cell: ({ row }: { row: { original: AttendanceRow } }) =>
              resolveBranchName(branches, row.original.branchId, user?.branch, user?.branch_name),
          }]
        : []),
      { accessorKey: 'attendanceDate', header: ct('members.attendanceDate'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
      { accessorKey: 'checkInTime', header: ct('members.checkInTime'), cell: ({ getValue }) => <span className="nums">{formatTimeFromDate(getValue() as string)}</span> },
      {
        accessorKey: 'duration',
        header: ct('members.duration'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        accessorKey: 'status',
        header: ct('common.status'),
        cell: ({ row }) => row.original.status === 'checked_in' ? (
          <StatusBadge status="active" label={ui('داخل الجيم الآن')} />
        ) : (
          <StatusBadge status="info" label={ui('سجّل خروج')} />
        ),
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) =>
          row.original.status === 'checked_in' ? (
            <Button size="sm" variant="outline" onClick={() => void handleCheckOut(row.original.id)}>
              <LogOut className="size-4" /> {ct('members.checkOut')}
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
    ],
    [branches, ct, isSystemAdmin, ui, user?.branch, user?.branch_name],
  );

  const dailyAttColumns = useMemo<ColumnDef<DailyAttendanceRow>[]>(
    () => [
      { accessorKey: 'memberName', header: ct('members.name') },
      { accessorKey: 'memberCode', header: ct('members.memberCode'), cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span> },
      ...(isSystemAdmin
        ? [{
            id: 'branch',
            header: ct('common.branch'),
            cell: ({ row }: { row: { original: DailyAttendanceRow } }) =>
              resolveBranchName(branches, row.original.branchId, user?.branch, user?.branch_name),
          }]
        : []),
      { accessorKey: 'date', header: ct('members.attendanceDate'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
      { accessorKey: 'entries', header: ui('عدد مرات الدخول'), cell: ({ getValue }) => <span className="nums font-semibold">{toArabicDigits(getValue() as number)}</span> },
      { accessorKey: 'totalDuration', header: ui('إجمالي المدة (دقيقة)'), cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as number) ?? 0)}</span> },
      {
        accessorKey: 'firstCheckIn',
        header: ui('أول دخول'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? <span className="nums">{formatTimeFromDate(v)}</span> : '—';
        },
      },
      {
        accessorKey: 'lastCheckOut',
        header: ui('آخر خروج'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? <span className="nums">{formatTimeFromDate(v)}</span> : '—';
        },
      },
    ],
    [branches, ct, isSystemAdmin, ui, user?.branch, user?.branch_name],
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={ct('members.title')} description={ct('members.description')} />
        <ErrorState message={apiError(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={singleView === 'attendance' ? ui('الحضور اليومي') : ct('members.title')}
        description={
          singleView === 'attendance'
            ? ui('متابعة الموجودين داخل الجيم وسجل خروج اليوم حسب فرع الحساب')
            : ct('members.description')
        }
        actions={
          canCreateMembers && singleView !== 'attendance' ? <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ct('members.newMember')}
          </Button> : undefined
        }
      />

      {memberOnboarding.visible && canCreateMembers && singleView !== 'attendance' && (
        <MemberOnboardingGuide
          scope="members"
          onDismiss={memberOnboarding.dismiss}
          onStart={() => {
            memberOnboarding.dismiss();
            openCreate();
          }}
        />
      )}

      {stats && tab === 'members' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <ClubStatCard label={ct('members.total')} value={stats.total} />
          <ClubStatCard label={ct('members.active')} value={stats.active} />
          <ClubStatCard label={ct('members.inactive')} value={stats.inactive} />
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ClubMembersView)}>
        {!singleView && (
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="members"><User className="size-4" /> {ct('members.tabMembers')}</TabsTrigger>
          <TabsTrigger value="attendance"><LogIn className="size-4" /> {ct('members.tabAttendance')}</TabsTrigger>
          <TabsTrigger value="financial"><Wallet className="size-4" /> {ct('members.tabFinancial')}</TabsTrigger>
        </TabsList>
        )}

        <TabsContent value="members" className="space-y-4 pt-4">
          <div className="flex justify-center">
            <Tabs
              value={memberListMode}
              onValueChange={(value) => {
                setMemberListMode(value as 'all' | 'blocked');
                setParams({ page: 1 });
              }}
            >
              <TabsList className="h-auto rounded-xl border bg-muted/40 p-1.5 shadow-sm">
                <TabsTrigger value="all" className="min-w-36">
                  <User className="size-4" /> {ui('جميع الأعضاء')}
                </TabsTrigger>
                <TabsTrigger value="blocked" className="min-w-36">
                  <UserX className="size-4" /> {ui('أعضاء محظورون')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {memberListMode === 'all' ? <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-medium">
              <LogIn className="size-4 text-primary" /> {ct('members.barcodeTitle')}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Input
                ref={checkInRef}
                className="max-w-xs"
                placeholder={ct('members.barcodePlaceholder')}
                value={checkInCode}
                onChange={(e) => setCheckInCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleCheckIn()}
              />
              <Button variant="brand" onClick={() => void handleCheckIn()} disabled={checkInLoading}>
                {ct('members.checkIn')}
              </Button>
            </div>
          </div> : null}

          <FilterBar fields={filters} />

          <DataTable
            columns={memberListMode === 'blocked' ? blockedColumns : columns}
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
            emptyTitle={memberListMode === 'blocked' ? ui('لا يوجد أعضاء محظورون') : ct('members.emptyMembers')}
            emptyAction={memberListMode === 'all' && canCreateMembers ? (
              <Button variant="brand" onClick={openCreate}>
                <User className="size-4" /> {ct('members.addFirst')}
              </Button>
            ) : undefined}
          />
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4 pt-4">
          <AttendanceSummaryCards statistics={attStats} />
          <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 shadow-sm md:p-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
            <div className="grid items-end gap-3 md:grid-cols-[minmax(13rem,1fr)_minmax(10rem,.7fr)_minmax(10rem,.7fr)_auto]">
              <div className="grid gap-1.5">
                <Label>{ct('common.branch')}</Label>
                {isSystemAdmin ? (
                  <select
                    className={`${selectCls} h-11 rounded-xl border-primary/25 font-medium`}
                    value={attendanceBranch}
                    onChange={(event) => {
                      setAttendanceBranch(event.target.value);
                      attParams.setParams({ page: 1 });
                      dailyParams.setParams({ page: 1 });
                    }}
                  >
                    <option value="">{ui('كل الفروع')}</option>
                    {(branches ?? []).map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name?.trim() || `${ui('فرع رقم')} ${branch.id}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex h-11 items-center gap-2 rounded-xl border border-primary/20 bg-muted/45 px-3 text-sm font-semibold">
                    <Building2 className="size-4 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{user?.branch_name ?? resolveBranchName(branches, user?.branch ?? 0)}</span>
                    <LockKeyhole className="size-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label>{ui('من تاريخ')}</Label>
                <Input
                  type="date"
                  value={attendanceStartDate}
                  onChange={(event) => {
                    setAttendanceStartDate(event.target.value);
                    attParams.setParams({ page: 1 });
                    dailyParams.setParams({ page: 1 });
                  }}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{ui('إلى تاريخ')}</Label>
                <Input
                  type="date"
                  value={attendanceEndDate}
                  min={attendanceStartDate || undefined}
                  onChange={(event) => {
                    setAttendanceEndDate(event.target.value);
                    attParams.setParams({ page: 1 });
                    dailyParams.setParams({ page: 1 });
                  }}
                  className="h-11 rounded-xl"
                />
              </div>
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                disabled={attendanceStartDate === localToday() && attendanceEndDate === localToday()}
                onClick={() => {
                  const today = localToday();
                  setAttendanceStartDate(today);
                  setAttendanceEndDate(today);
                  attParams.setParams({ page: 1 });
                  dailyParams.setParams({ page: 1 });
                }}
              >
                {ui('اليوم')}
              </Button>
            </div>

            <div className="mt-5 grid gap-5 border-t pt-5 lg:grid-cols-2">
              <div className="space-y-2 text-center">
                <Label className="text-muted-foreground">{ui('طريقة العرض')}</Label>
                <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-2 rounded-2xl bg-muted/35 p-1.5">
                  {([
                    { value: 'all' as const, label: ui('سجل الدخول والخروج') },
                    { value: 'daily' as const, label: ui('ملخص يومي للأعضاء') },
                  ]).map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={attView === option.value ? 'brand' : 'ghost'}
                      aria-pressed={attView === option.value}
                      className="h-11 rounded-xl"
                      onClick={() => setAttView(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-center">
                <Label className="text-muted-foreground">{ui('حالة الحضور')}</Label>
                <div className="mx-auto grid w-full max-w-xl grid-cols-3 gap-2 rounded-2xl bg-muted/35 p-1.5">
                  {([
                    { value: 'all' as const, label: ui('الكل'), icon: UserCheck },
                    { value: 'checked_in' as const, label: ui('داخل الجيم'), icon: LogIn },
                    { value: 'checked_out' as const, label: ui('سجّل خروج'), icon: LogOut },
                  ]).map((option) => {
                    const Icon = option.icon;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant={attendanceStatus === option.value ? 'brand' : 'ghost'}
                        aria-pressed={attendanceStatus === option.value}
                        className="h-11 rounded-xl px-2"
                        onClick={() => {
                          setAttendanceStatus(option.value);
                          attParams.setParams({ page: 1 });
                          dailyParams.setParams({ page: 1 });
                        }}
                      >
                        <Icon className="size-4" />
                        <span>{option.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
          {attView === 'all' ? (
            <DataTable
              columns={attColumns}
              data={attendance?.data ?? []}
              total={attendance?.total ?? 0}
              page={attParams.params.page}
              pageSize={attParams.params.pageSize}
              onPageChange={(page) => attParams.setParams({ page })}
              onPageSizeChange={(pageSize) => attParams.setParams({ pageSize, page: 1 })}
              search={attParams.params.search}
              onSearchChange={(search) => attParams.setParams({ search, page: 1 })}
              isLoading={attLoading}
              isError={attError}
              onRetry={() => void refetchAttendance()}
              emptyTitle={ct('common.noData')}
            />
          ) : (
            <DataTable
              columns={dailyAttColumns}
              data={dailyAttendance?.data ?? []}
              total={dailyAttendance?.total ?? 0}
              page={dailyParams.params.page}
              pageSize={dailyParams.params.pageSize}
              onPageChange={(page) => dailyParams.setParams({ page })}
              onPageSizeChange={(pageSize) => dailyParams.setParams({ pageSize, page: 1 })}
              search={dailyParams.params.search}
              onSearchChange={(search) => dailyParams.setParams({ search, page: 1 })}
              isLoading={dailyLoading}
              isError={dailyError}
              onRetry={() => void refetchDaily()}
              emptyTitle={ct('common.noData')}
            />
          )}
        </TabsContent>

        <TabsContent value="financial" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
            <div className="grid gap-2">
              <Label>{ct('members.financialMemberId')}</Label>
              <Input className="max-w-xs font-mono" dir="ltr" value={financialCode} onChange={(e) => setFinancialCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void refetchFinancial()} />
            </div>
            <Button variant="brand" onClick={() => void refetchFinancial()} disabled={!financialCode.trim() || financialLoading}>
              {ct('members.loadFinancial')}
            </Button>
          </div>
          {financial && (
            <>
              <h3 className="font-medium">{ct('members.financialSummary')}</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <ClubStatCard label={ct('members.totalSubs')} value={financial.summary.totalSubscriptions} />
                <ClubStatCard label={ct('members.totalPaid')} value={financial.summary.totalPaidOnSubscriptions} />
                <ClubStatCard label={ct('members.totalRemaining')} value={financial.summary.totalRemaining} />
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-start">{ct('common.status')}</th>
                      <th className="p-3 text-start">{ct('common.amount')}</th>
                      <th className="p-3 text-start">{ct('members.attendanceDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financial.timeline.length === 0 && (
                      <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                    )}
                    {financial.timeline.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-3">{item.kind === 'subscription' ? item.data.subscriptionNumber : item.data.receiptNumber}</td>
                        <td className="p-3 nums">{toArabicDigits(item.data.paidAmount ?? item.data.amount ?? 0)}</td>
                        <td className="p-3 nums">{toArabicDigits(item.sortDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deletingMember && refundingSubscriptionId == null) {
            setDeleteTarget(null);
            setDeletePreview(null);
          }
        }}
      >
        <DialogContent
          className="flex max-h-[92vh] w-[min(96vw,980px)] max-w-[980px] flex-col gap-0 overflow-hidden p-0"
          aria-describedby={undefined}
        >
          <div className="border-b px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" />
              {ui('تسوية وحذف العضو')}
            </DialogTitle>
            {deleteTarget && (
              <p className="mt-1 text-sm text-muted-foreground">
                {deleteTarget.name}{' '}
                <span className="nums font-mono">— {deleteTarget.memberCode}</span>
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {deletePreviewLoading && !deletePreview ? (
              <div className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                {ui('جارٍ جمع كل الحركات المالية…')}
              </div>
            ) : deletePreview ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/20 p-4">
                  <div className="grid gap-1.5">
                    <Label>{ui('تاريخ إيقاف الاشتراكات')}</Label>
                    <Input
                      type="date"
                      className="nums w-48"
                      value={deleteStopDate}
                      disabled={refundingSubscriptionId != null || deletingMember}
                      onChange={(event) => setDeleteStopDate(event.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={
                      !deleteTarget ||
                      !deleteStopDate ||
                      deletePreviewLoading ||
                      refundingSubscriptionId != null ||
                      deletingMember
                    }
                    onClick={() => {
                      if (deleteTarget) void loadDeletionPreview(deleteTarget.id, deleteStopDate);
                    }}
                  >
                    <RefreshCw className={`size-4 ${deletePreviewLoading ? 'animate-spin' : ''}`} />
                    {ui('إعادة الحساب')}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {ui('يُحسب الاسترداد حسب الأيام أو الحصص غير المستخدمة حتى هذا التاريخ.')}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{ui('إجمالي الإيصالات')}</p>
                    <p className="nums mt-1 text-xl font-semibold">
                      {formatMoney(deletePreview.totals.receipts)}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{ui('تم استرداده سابقًا')}</p>
                    <p className="nums mt-1 text-xl font-semibold text-muted-foreground">
                      {formatMoney(deletePreview.totals.refunded)}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl border p-4 ${
                      deletePreview.requiresRefund
                        ? 'border-amber-500/40 bg-amber-500/10'
                        : 'border-emerald-500/40 bg-emerald-500/10'
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">{ui('واجب الاسترداد الآن')}</p>
                    <p
                      className={`nums mt-1 text-xl font-semibold ${
                        deletePreview.requiresRefund ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatMoney(deletePreview.totals.refundable)}
                    </p>
                  </div>
                </div>

                {deletePreview.requiresRefund ? (
                  <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                    <div>
                      <p className="font-semibold">{ui('لا يمكن إنهاء العضو قبل رد المبلغ الموضح.')}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {ui('يمكنك استرداد كل اشتراك منفردًا أو الضغط على «استرداد الكل».')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-950 dark:text-emerald-100">
                    <Archive className="mt-0.5 size-5 shrink-0" />
                    <div>
                      <p className="font-semibold">{ui('لا توجد مبالغ أخرى واجبة الاسترداد.')}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {deletePreview.hasFinancialHistory
                          ? ui('سيتم أرشفة العضو وإخفاؤه مع الاحتفاظ بالإيصالات والاستردادات وسجل التدقيق.')
                          : ui('لا توجد حركة مالية؛ يمكن حذف العضو الآن.')}
                      </p>
                    </div>
                  </div>
                )}

                <section className="space-y-3">
                  <h3 className="font-semibold">{ui('الاشتراكات والإيصالات')}</h3>
                  {deletePreview.subscriptions.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                      {ui('لا توجد اشتراكات مرتبطة بهذا العضو.')}
                    </div>
                  ) : (
                    deletePreview.subscriptions.map((subscription) => (
                      <div key={subscription.id} className="overflow-hidden rounded-xl border bg-card">
                        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                          <div>
                            <p className="font-semibold">
                              {subscription.subscriptionType ?? ui('اشتراك')}
                            </p>
                            <p className="nums text-xs text-muted-foreground">
                              {subscription.subscriptionNumber} · {toArabicDigits(subscription.startDate)}
                              {' — '}
                              {toArabicDigits(subscription.endDate)}
                            </p>
                          </div>
                          <StatusBadge
                            status={subscription.status === 'active' ? 'active' : 'expired'}
                          />
                        </div>

                        <div className="grid gap-3 border-y bg-muted/15 p-4 text-sm sm:grid-cols-4">
                          <div>
                            <p className="text-xs text-muted-foreground">{ui('المدفوع')}</p>
                            <p className="nums font-medium">{formatMoney(subscription.paidAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{ui('المتبقي عليه')}</p>
                            <p className="nums font-medium">{formatMoney(subscription.remainingAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{ui('مسترد سابقًا')}</p>
                            <p className="nums font-medium">{formatMoney(subscription.refundedTotal)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{ui('مسترد الآن')}</p>
                            <p
                              className={`nums font-semibold ${
                                subscription.requiresRefund ? 'text-amber-700' : 'text-emerald-700'
                              }`}
                            >
                              {formatMoney(subscription.refundPreview?.refundAmount ?? 0)}
                            </p>
                          </div>
                        </div>

                        {subscription.refundPreview && (
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-xs">
                            <p className="text-muted-foreground">
                              {subscription.refundPreview.refundBasis === 'sessions'
                                ? `${ui('الحصص المتبقية')}: ${toArabicDigits(
                                    subscription.refundPreview.remainingSessions ?? 0,
                                  )}`
                                : `${ui('الأيام المتبقية')}: ${toArabicDigits(
                                    subscription.refundPreview.remainingDays,
                                  )}`}
                              {' · '}
                              {ui('قيمة الاستهلاك')}: {formatMoney(subscription.refundPreview.consumedValue)}
                            </p>
                            {subscription.requiresRefund && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={refundingSubscriptionId != null || deletingMember}
                                onClick={() => void refundDeletionSubscription(subscription)}
                              >
                                {refundingSubscriptionId === subscription.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Undo2 className="size-4" />
                                )}
                                {ui('استرداد')} {formatMoney(subscription.refundPreview.refundAmount)}
                              </Button>
                            )}
                          </div>
                        )}

                        {subscription.refundUnavailableReason &&
                          subscription.status !== 'expired' &&
                          subscription.paidAmount > 0 && (
                            <p className="border-b px-4 py-3 text-xs text-muted-foreground">
                              {subscription.refundUnavailableReason}
                            </p>
                          )}

                        {(subscription.receipts.length > 0 || subscription.refunds.length > 0) && (
                          <div className="space-y-2 p-4">
                            {subscription.receipts.map((receipt) => (
                              <div
                                key={`receipt-${receipt.id}`}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="nums text-muted-foreground">
                                  {ui('إيصال')} {receipt.receiptNumber} · {toArabicDigits(receipt.receiptDate)}
                                </span>
                                <span className="nums font-medium">{formatMoney(receipt.amount)}</span>
                              </div>
                            ))}
                            {subscription.refunds.map((refund) => (
                              <div
                                key={`refund-${refund.id}`}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-700"
                              >
                                <span className="nums">
                                  {ui('استرداد')} {refund.invoiceNumber} · {toArabicDigits(refund.refundDate)}
                                </span>
                                <span className="nums font-medium">− {formatMoney(refund.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </section>

                {deletePreview.otherFinancialItems.length > 0 && (
                  <section className="space-y-3">
                    <div>
                      <h3 className="font-semibold">{ui('حركات مالية أخرى محفوظة')}</h3>
                      <p className="text-xs text-muted-foreground">
                        {ui('هذه مستندات تاريخية ستظل محفوظة بعد أرشفة العضو ولن يتم حذفها.')}
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {deletePreview.otherFinancialItems.map((item) => (
                        <div
                          key={item.kind}
                          className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                        >
                          <div>
                            <p className="font-medium">{item.label}</p>
                            <p className="nums text-xs text-muted-foreground">
                              {toArabicDigits(item.count)} {ui('حركة')}
                            </p>
                          </div>
                          <span className="nums font-semibold">{formatMoney(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                <AlertTriangle className="size-8 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  {ui('تعذّر تحميل ملخص الحركات المالية.')}
                </p>
                <Button
                  variant="outline"
                  disabled={!deleteTarget || deletePreviewLoading}
                  onClick={() => {
                    if (deleteTarget) void loadDeletionPreview(deleteTarget.id, deleteStopDate);
                  }}
                >
                  <RefreshCw className="size-4" />
                  {ui('إعادة المحاولة')}
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-card px-6 py-4">
            <Button
              variant="outline"
              disabled={deletingMember || refundingSubscriptionId != null}
              onClick={() => {
                setDeleteTarget(null);
                setDeletePreview(null);
              }}
            >
              {ct('common.cancel')}
            </Button>
            <div className="flex flex-wrap gap-2">
              {deletePreview?.requiresRefund && (
                <Button
                  variant="destructive"
                  disabled={deletingMember || refundingSubscriptionId != null}
                  onClick={() => void refundAllDeletionSubscriptions()}
                >
                  {refundingSubscriptionId === 'all' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Undo2 className="size-4" />
                  )}
                  {ui('استرداد الكل')} ({formatMoney(deletePreview.totals.refundable)})
                </Button>
              )}
              <Button
                variant={deletePreview?.hasFinancialHistory ? 'brand' : 'destructive'}
                disabled={
                  !deletePreview ||
                  deletePreview.requiresRefund ||
                  deletingMember ||
                  refundingSubscriptionId != null
                }
                onClick={() => void finishMemberDeletion()}
              >
                {deletingMember ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : deletePreview?.hasFinancialHistory ? (
                  <Archive className="size-4" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {deletePreview?.hasFinancialHistory
                  ? ui('أرشفة العضو وإنهاء خدماته')
                  : ct('common.delete')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}>
          <FormDialogHeader>
            <DialogTitle>{editId ? ct('members.editMember') : ct('members.newMember')}</DialogTitle>
          </FormDialogHeader>

          <FormDialogBody>
          <form
            id="member-form"
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              void saveMember();
            }}
          >

          {generatedCredentials && (
            <div className="relative rounded-xl border border-primary/30 bg-primary/5 p-4">
              <Button
                size="icon"
                variant="ghost"
                className="absolute start-2 top-2 size-6"
                onClick={() => setGeneratedCredentials(null)}
              >
                <X className="size-4" />
              </Button>
              <p className="mb-2 text-sm font-medium text-primary">{ct('members.credentialsGenerated')}</p>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{ct('members.appUsername')}:</span>
                  <code className="rounded bg-background px-2 py-1 nums" dir="ltr">{generatedCredentials.username}</code>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{ct('members.appPassword')}:</span>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-background px-2 py-1 nums" dir="ltr">{generatedCredentials.password}</code>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${ct('members.appUsername')}: ${generatedCredentials.username}\n${ct('members.appPassword')}: ${generatedCredentials.password}`,
                        );
                        toast.success(ct('common.copied'));
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <DialogFormSection title={ct('members.sectionBasic')} icon={User}>
              <DialogFormGrid>
                <FieldWrapper label={ct('common.branch')} required>
                  {isSystemAdmin && !editId ? (
                    <select
                      className={selectCls}
                      value={form.branchId || ''}
                      onChange={(e) => setForm((f) => ({ ...f, branchId: Number(e.target.value) || 0 }))}
                    >
                      <option value="">{ct('members.selectBranch')}</option>
                      {branchOptions.map((branch) => (
                        <option key={branch.value} value={branch.value}>{branch.label}</option>
                      ))}
                    </select>
                  ) : (
                    <Input className="bg-muted" value={formBranchName} readOnly />
                  )}
                </FieldWrapper>
                <FieldWrapper
                  label={ct('members.memberCode')}
                  hint={!editId && previewMemberCode ? ct('members.codeAutoPreview') : undefined}
                >
                  <Input
                    className="nums bg-muted font-mono"
                    dir="ltr"
                    value={editId ? editMemberCode : previewMemberCode}
                    placeholder={!editId && !form.branchId ? ct('members.selectBranchFirst') : undefined}
                    readOnly
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('members.name')} required>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label={ct('members.phone')} required>
                  <Input
                    className="nums"
                    dir="ltr"
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    maxLength={11}
                    aria-invalid={!!phoneValidationError}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="01012345678"
                  />
                  {checkingPhone && <p className="mt-1 text-xs text-muted-foreground">جارٍ التحقق من الرقم…</p>}
                  {phoneValidationError && <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3.5" />{phoneValidationError}</p>}
                </FieldWrapper>
                <FieldWrapper label={ct('members.gender')} required>
                  <select
                    className={selectCls}
                    value={form.gender}
                    onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as 'male' | 'female' }))}
                  >
                    {genderOptions.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ct('members.dateOfBirth')}>
                  <Input
                    type="date"
                    className="nums"
                    dir="ltr"
                    value={form.dateOfBirth}
                    onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </FieldWrapper>
              </DialogFormGrid>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
                <FieldWrapper label={ct('common.notes')}>
                  <Textarea
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="resize-none"
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('members.photo')}>
                  <UploadField
                    category="club-member"
                    value={form.profilePicture}
                    onChange={(path) => setForm((f) => ({ ...f, profilePicture: path ?? '' }))}
                  />
                </FieldWrapper>
              </div>

              <FieldWrapper label="ملف العضوية والمستندات" hint={editId ? 'PDF موثّق فقط، بحد أقصى 5 ميجابايت لكل ملف' : 'احفظ بيانات العضو أولاً ثم أرفق المستندات'}>
                {editId ? (
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                    <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
                      <select className={selectCls} value={documentType} onChange={(event) => setDocumentType(event.target.value)} aria-label="نوع المستند">
                        <option value="national_id">بطاقة الرقم القومي</option>
                        <option value="contract">عقد العضوية</option>
                        <option value="medical_clearance">إقرار طبي</option>
                        <option value="other">مستند آخر</option>
                      </select>
                      <Input type="file" accept="application/pdf,.pdf" disabled={memberDocumentUploading} onChange={(event) => { void addMemberDocument(event.target.files?.[0] ?? null); event.target.value = ''; }} />
                    </div>
                    {memberDocumentUploading ? <p className="text-xs text-muted-foreground">جارٍ فحص ورفع المستند…</p> : null}
                    {membershipDocuments.length ? (
                      <ul className="divide-y rounded-lg border bg-background">
                        {membershipDocuments.map((document) => (
                          <li key={document.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <FileText className="size-4 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1"><p className="truncate font-medium">{document.label || document.originalFilename || 'مستند عضوية'}</p><p className="text-xs text-muted-foreground">{document.type} {document.byteSize ? `• ${(document.byteSize / 1024).toFixed(1)} KB` : ''}</p></div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => void openMemberDocument(document)} aria-label="فتح المستند"><ExternalLink className="size-4" /></Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => void removeMemberDocument(document.id)} aria-label="حذف المستند"><Trash2 className="size-4 text-destructive" /></Button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">لا توجد مستندات مرفقة بعد.</p>}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">سيظهر رفع المستند بعد إنشاء العضو.</p>
                )}
              </FieldWrapper>

              <DialogFormToggle
                label={ct('members.isActive')}
                checked={!!form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
            </DialogFormSection>

            <DialogFormSection title={ct('members.sectionContact')} icon={Phone}>
              <DialogFormGrid>
                <FieldWrapper label={ct('members.email')}>
                  <Input
                    type="email"
                    dir="ltr"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="name@example.com"
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('members.maritalStatus')}>
                  <select
                    className={selectCls}
                    value={form.maritalStatus ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, maritalStatus: e.target.value }))}
                  >
                    <option value="">—</option>
                    <option value="single">{ct('members.single')}</option>
                    <option value="married">{ct('members.married')}</option>
                    <option value="divorced">{ct('members.divorced')}</option>
                    <option value="widowed">{ct('members.widowed')}</option>
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ct('members.address')} className="sm:col-span-2">
                  <Input value={form.address ?? ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label={ct('members.jobTitle')} className="sm:col-span-2">
                  <Input value={form.jobTitle ?? ''} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
                </FieldWrapper>
              </DialogFormGrid>
            </DialogFormSection>

            <DialogFormSection title={ct('members.sectionStaff')} icon={Briefcase}>
              <DialogFormGrid>
                <FieldWrapper label={ct('members.salesRep')}>
                  <select
                    className={selectCls}
                    value={form.salesId ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, salesId: e.target.value ? Number(e.target.value) : undefined }))}
                  >
                    <option value="">—</option>
                    {salesRepOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ui('الموظف المُسجِّل')}>
                  <Input className="bg-muted" value={user?.name ?? '—'} readOnly />
                </FieldWrapper>
                <FieldWrapper label={ct('members.guardianName')}>
                  <Input value={form.guardianName ?? ''} onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label={ct('members.guardianPhone')}>
                  <Input className="nums" dir="ltr" value={form.guardianPhone ?? ''} onChange={(e) => setForm((f) => ({ ...f, guardianPhone: e.target.value }))} />
                </FieldWrapper>
              </DialogFormGrid>
            </DialogFormSection>

            <DialogFormSection title={ct('members.sectionAppAccount')} icon={Smartphone}>
              {!editId && (
                <DialogFormToggle
                  label={ct('members.autoCreateUser')}
                  hint={ct('members.appAccountHint')}
                  checked={!!form.autoCreateUser}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, autoCreateUser: checked }))}
                />
              )}
              {!editId && form.autoCreateUser && (
                <FieldWrapper label={ct('members.appUsername')}>
                  <Input className="nums bg-muted" dir="ltr" value={form.phone || ct('members.enterPhone')} readOnly />
                </FieldWrapper>
              )}
              {editId && (
                <>
                  <FieldWrapper label={ct('members.appUsername')}>
                    <Input className="nums bg-muted" dir="ltr" value={form.phone || ct('members.enterPhone')} readOnly />
                  </FieldWrapper>
                  <p className="text-xs text-muted-foreground">{ct('members.appAccountHint')}</p>
                </>
              )}
            </DialogFormSection>
          </div>
          </form>
          </FormDialogBody>

          <FormDialogFooter className="justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{ct('common.cancel')}</Button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              {(editId ? canUpdateMembers : canCreateMembers) ? (
                <Button type="submit" form="member-form" variant="brand" disabled={saving}>
                  {saving ? ct('common.saving') : editId ? ct('members.saveChanges') : ct('members.saveOnly')}
                </Button>
              ) : null}
              {!editId && canCreateMembers && (
                <Button type="button" variant="brand" disabled={saving} onClick={() => void saveMember('subscription')}>
                  {saving ? ct('common.saving') : ct('members.saveAndAddSub')}
                </Button>
              )}
            </div>
          </FormDialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
