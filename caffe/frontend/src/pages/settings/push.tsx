import { useQuery } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { confirm } from '@/lib/confirm';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface BranchOption {
  id: number;
  name: string | null;
}

interface BroadcastResult {
  sent: number;
  skipped: number;
}

export function PushBroadcastPage() {
  const { ui } = useLocale();
  // Branch list reuses the shared GET /branches endpoint when available.
  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await api.get<BranchOption[]>('/branches');
      return data;
    },
    retry: false,
  });

  const branchOptions = branches
    .filter((b) => b.name)
    .map((b) => ({ value: String(b.id), label: b.name as string }));

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'branch'>('all');
  const [branchId, setBranchId] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error(ui('العنوان والنص مطلوبان'));
      return;
    }
    if (target === 'branch' && !branchId) {
      toast.error(ui('اختر الفرع المستهدف'));
      return;
    }
    const ok = await confirm({
      title: target === 'all' ? ui('إرسال للجميع؟') : ui('إرسال للفرع؟'),
      description: ui('سيتُنشأ إشعار في النظام لكل مستخدم مستهدف. التسليم الفوري يتطلب تسجيل جهاز (device token).'),
      confirmLabel: ui('إرسال'),
    });
    if (!ok) return;
    setSending(true);
    try {
      const { data } = await api.post<BroadcastResult>('/push/broadcast', {
        title: title.trim(),
        body: body.trim(),
        branchId: target === 'branch' ? parseInt(branchId, 10) : undefined,
      });
      toast.success(
        ui(`تم إنشاء الإشعار — مُرسل: ${data.sent} · بدون جهاز: ${data.skipped}`),
      );
      setTitle('');
      setBody('');
      setTarget('all');
      setBranchId('');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={ui('إرسال إشعار')} description={ui('إرسال إشعار فوري للمستخدمين عبر تطبيق الجوال')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ui('إنشاء إشعار')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="push-title">{ui('العنوان')}</Label>
            <Input
              id="push-title"
              className="mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ui('عنوان الإشعار')}
            />
          </div>

          <div>
            <Label htmlFor="push-body">{ui('النص')}</Label>
            <Textarea
              id="push-body"
              className="mt-1.5"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={ui('نص الإشعار')}
            />
          </div>

          <div>
            <Label>{ui('المستهدفون')}</Label>
            <RadioGroup
              className="mt-2 flex gap-6"
              value={target}
              onValueChange={(v) => setTarget(v as 'all' | 'branch')}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="target-all" />
                <Label htmlFor="target-all" className="font-normal">{ui('إرسال للجميع')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="branch" id="target-branch" disabled={branchOptions.length === 0} />
                <Label htmlFor="target-branch" className="font-normal">{ui('فرع محدد')}</Label>
              </div>
            </RadioGroup>
          </div>

          {target === 'branch' && (
            <div>
              <Label>{ui('الفرع')}</Label>
              <div className="mt-1.5">
                {branchesLoading ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                ) : (
                  <Combobox
                    value={branchId}
                    onValueChange={setBranchId}
                    options={branchOptions}
                    placeholder={ui('اختر الفرع…')}
                    searchPlaceholder={ui('بحث في الفروع…')}
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="brand" size="sm" disabled={sending} onClick={() => void send()}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {ui('إرسال')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
