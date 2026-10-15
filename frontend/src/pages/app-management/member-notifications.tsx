import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/formatters';
import { buildMemberNotificationRequest } from '@/lib/member-notification-compose';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { AppManagementShell } from './app-shell';

interface BranchOption {
  id: number;
  name: string | null;
}

interface MemberNotificationRow {
  id: number;
  memberId: number;
  title: string;
  body: string;
  createdAt: string;
}

export function AppMemberNotificationsPage() {
  const { ui, locale } = useLocale();
  const { can } = usePermission();
  const canCreate = can('app-management.notifications:create');
  const qc = useQueryClient();
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await api.get<BranchOption[]>('/branches');
      return data;
    },
    retry: false,
  });
  const { data: recent } = useQuery({
    queryKey: ['app', 'notifications'],
    queryFn: async () => {
      const { data } = await api.get<{ data: MemberNotificationRow[]; total: number }>(
        '/app/notifications',
        { params: { page: 1, pageSize: 20 } },
      );
      return data;
    },
  });

  const branchOptions = branches
    .filter((branch) => branch.name)
    .map((branch) => ({ value: String(branch.id), label: branch.name as string }));

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'branch'>('all');
  const [branchId, setBranchId] = useState('');
  const [appUsersOnly, setAppUsersOnly] = useState(true);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!canCreate) return;
    if (!title.trim() || !body.trim()) {
      toast.error(ui('العنوان والنص مطلوبان'));
      return;
    }
    if (target === 'branch' && !branchId) {
      toast.error(ui('اختر الفرع المستهدف'));
      return;
    }
    const ok = await confirm({
      title: target === 'all' ? ui('إرسال لكل أعضاء التطبيق؟') : ui('إرسال لفرع محدد؟'),
      description: appUsersOnly
        ? ui('سيظهر الإشعار في تطبيق الموبايل لكل الأعضاء الذين لديهم حساب تطبيق.')
        : ui('سيظهر الإشعار لكل الأعضاء النشطين، حتى من لم يحمّلوا التطبيق.'),
      confirmLabel: ui('إرسال'),
    });
    if (!ok) return;
    setSending(true);
    try {
      const payload = buildMemberNotificationRequest({ title, body, target, branchId, appUsersOnly });
      const { data } = await api.post<{ sent: number }>('/app/notifications', payload);
      toast.success(`${ui('تم إنشاء الإشعار لـ')} ${toArabicDigits(data.sent)} ${ui('عضو')}`);
      setTitle('');
      setBody('');
      setTarget('all');
      setBranchId('');
      void qc.invalidateQueries({ queryKey: ['app', 'notifications'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSending(false);
    }
  };

  const distinctRecent = Array.from(
    new Map((recent?.data ?? []).map((row) => [`${row.title}\n${row.body}`, row])).values(),
  );

  return (
    <AppManagementShell
      title={ui('إشعارات الأعضاء')}
      description={ui('إرسال عروض وتنبيهات إلى صندوق إشعارات تطبيق الموبايل')}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ui('إرسال إشعار ترويجي')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="member-notification-title">{ui('العنوان')}</Label>
            <Input
              id="member-notification-title"
              className="mt-1.5"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={ui('مثال: عرض تجديد الاشتراك')}
            />
          </div>
          <div>
            <Label htmlFor="member-notification-body">{ui('النص')}</Label>
            <Textarea
              id="member-notification-body"
              className="mt-1.5"
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={ui('نص العرض أو التنبيه')}
            />
          </div>
          <div>
            <Label>{ui('المستهدفون')}</Label>
            <RadioGroup
              className="mt-2 flex flex-wrap gap-6"
              value={target}
              onValueChange={(value) => setTarget(value as 'all' | 'branch')}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="member-target-all" />
                <Label htmlFor="member-target-all" className="font-normal">{ui('كل الفروع')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="branch" id="member-target-branch" disabled={!branchOptions.length} />
                <Label htmlFor="member-target-branch" className="font-normal">{ui('فرع محدد')}</Label>
              </div>
            </RadioGroup>
          </div>
          {target === 'branch' ? (
            <div>
              <Label>{ui('الفرع')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={branchId}
                  onValueChange={setBranchId}
                  options={branchOptions}
                  placeholder={ui('اختر الفرع…')}
                  searchPlaceholder={ui('بحث في الفروع…')}
                />
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 rounded-xl border px-3 py-2">
            <div>
              <Label htmlFor="member-app-users-only" className="text-sm font-medium">
                {ui('فقط من لديهم تطبيق الموبايل')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {ui('الأعضاء الذين نزّلوا التطبيق وسجّلوا الدخول.')}
              </p>
            </div>
            <Switch
              id="member-app-users-only"
              checked={appUsersOnly}
              onCheckedChange={setAppUsersOnly}
            />
          </div>
          {canCreate ? (
            <div className="flex justify-end pt-2">
              <Button
                permissionResource="app-management.notifications"
                permissionAction="create"
                variant="brand"
                size="sm"
                disabled={sending}
                onClick={() => void send()}
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {sending ? ui('جاري الإرسال…') : ui('إرسال')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ui('آخر الإشعارات')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!distinctRecent.length ? (
            <p className="text-sm text-muted-foreground">{ui('لا توجد إشعارات بعد')}</p>
          ) : (
            <ul className="divide-y">
              {distinctRecent.map((row) => (
                <li key={row.id} className="py-3">
                  <p className="font-medium">{row.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{row.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground nums">
                    {formatDateTime(row.createdAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppManagementShell>
  );
}
