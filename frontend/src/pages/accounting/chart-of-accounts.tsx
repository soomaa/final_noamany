import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, Sprout } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import type { AccountNode } from '@/types/accounting';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';
import { uiStatic } from '@/lib/ui-static';

function AccountTreeRow({ node, depth = 0 }: { node: AccountNode; depth?: number }) {
  const { ui } = useLocale();
  return (
    <>
      <tr className="border-b hover:bg-muted/30">
        <td className="p-2 nums" style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}>
          {node.code}
        </td>
        <td className="p-2">{node.name}</td>
        <td className="p-2">{node.accountType}</td>
        <td className="p-2">{node.isPostable ? uiStatic('نعم') : uiStatic('لا')}</td>
      </tr>
      {node.children.map((c) => (
        <AccountTreeRow key={c.id} node={c} depth={depth + 1} />
      ))}
    </>
  );
}

export function ChartOfAccountsPage() {
  const { ui } = useLocale();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['accounting', 'accounts', 'tree'],
    queryFn: async () => {
      const { data: d } = await api.get<AccountNode[]>('/accounting/accounts/tree');
      return d;
    },
  });

  const flatAccounts = flattenTree(data ?? []);

  const seedMutation = useMutation({
    mutationFn: () => api.post('/accounting/accounts/seed-defaults'),
    onSuccess: () => {
      toast.success(ui('تم تهيئة دليل الحسابات'));
      void refetch();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; parentId?: number }) =>
      api.post('/accounting/accounts', payload),
    onSuccess: () => {
      toast.success(ui('تم إنشاء الحساب'));
      setOpen(false);
      setName('');
      setParentId('');
      void refetch();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <AccountingPageShell
      title={ui('دليل الحسابات')}
      description={ui('شجرة الحسابات المحاسبية — الأرصدة تُحسب من القيود المرحّلة فقط')}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await confirm({
                title: ui('تهيئة دليل الحسابات'),
                description: ui('سيتم إنشاء الحسابات الافتراضية للنادي (آمن للتكرار)'),
              });
              if (ok) seedMutation.mutate();
            }}
          >
            <Sprout className="h-4 w-4" />
            {ui('تهيئة افتراضي')}
          </Button>
          <Button variant="brand" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {ui('حساب جديد')}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="p-3 text-start">{ui('الرمز')}</th>
              <th className="p-3 text-start">{ui('الاسم')}</th>
              <th className="p-3 text-start">{ui('النوع')}</th>
              <th className="p-3 text-start">{ui('قابل للترحيل')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  {ui('جاري التحميل…')}
                </td>
              </tr>
            )}
            {/* Distinguish a load failure from a genuinely empty chart of accounts. */}
            {!isLoading && isError && (
              <tr>
                <td colSpan={4} className="p-6 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <span>{ui('تعذّر تحميل دليل الحسابات')}</span>
                    <Button variant="outline" size="sm" onClick={() => void refetch()}>
                      <RefreshCw className="h-4 w-4" />
                      {ui('إعادة المحاولة')}
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !isError && (data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  {ui('لا توجد حسابات — اضغط «تهيئة افتراضي» للبدء')}
                </td>
              </tr>
            )}
            {!isError &&
              (data ?? []).map((n) => (
                <AccountTreeRow key={n.id} node={n} />
              ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ui('حساب جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>{ui('الاسم')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>{ui('الحساب الأب (اختياري)')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">{ui('— بدون —')}</option>
                {flatAccounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button
              variant="brand"
              disabled={!name.trim() || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  name: name.trim(),
                  ...(parentId ? { parentId: Number(parentId) } : {}),
                })
              }
            >
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountingPageShell>
  );
}

function flattenTree(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (list: AccountNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
