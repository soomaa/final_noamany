import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WasteReason } from '@/pages/cafe/waste-types';

export function WasteReasonsTab() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const { data: reasons = [], isLoading } = useQuery({
    queryKey: ['cafe-waste', 'reasons', 'all'],
    queryFn: async () => (await api.get<WasteReason[]>('/cafe-waste/reasons', { params: { includeInactive: true } })).data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cafe-waste', 'reasons'] });
  const createMutation = useMutation({
    mutationFn: async () => api.post('/cafe-waste/reasons', { name: newName.trim() }),
    onSuccess: async () => { setNewName(''); toast.success(ui('تمت إضافة سبب الهالك')); await invalidate(); },
    onError: (error) => toast.error(apiError(error)),
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name?: string; isActive?: boolean } }) => api.patch(`/cafe-waste/reasons/${id}`, data),
    onSuccess: async () => { setEditingId(null); toast.success(ui('تم تحديث سبب الهالك')); await invalidate(); },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader><CardTitle>{ui('أسباب الهالك الموحّدة')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">{ui('جاري تحميل الأسباب…')}</p>}
          {!isLoading && reasons.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{ui('لم تُضف أسباب بعد')}</p>}
          {reasons.map((reason) => (
            <div key={reason.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                {editingId === reason.id ? <Input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={120} /> : <p className="font-semibold">{reason.name}</p>}
              </div>
              <Badge variant={reason.isActive ? 'default' : 'secondary'}>{reason.isActive ? ui('نشط') : ui('متوقف')}</Badge>
              <div className="flex gap-1">
                {editingId === reason.id ? <><Button permissionAction="update" size="icon" variant="ghost" disabled={editingName.trim().length < 2 || updateMutation.isPending} onClick={() => updateMutation.mutate({ id: reason.id, data: { name: editingName.trim() } })}><Check className="size-4 text-emerald-600" /></Button><Button permissionAction={null} size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="size-4" /></Button></> : <Button permissionAction="update" size="icon" variant="ghost" onClick={() => { setEditingId(reason.id); setEditingName(reason.name); }}><Pencil className="size-4" /></Button>}
                <Button permissionAction="update" size="sm" variant="outline" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ id: reason.id, data: { isActive: !reason.isActive } })}>{reason.isActive ? ui('تعطيل') : <><RotateCcw className="size-3" />{ui('تفعيل')}</>}</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="h-fit border-primary/20 bg-primary/5">
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="size-5 text-primary" />{ui('إضافة سبب جديد')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">{ui('السبب يُتاح فورًا لكل الفروع ويمكن إضافته أيضًا أثناء تسجيل الهالك.')}</p>
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={ui('مثال: انقطاع تبريد')} maxLength={120} />
          <Button permissionAction="create" className="w-full" disabled={newName.trim().length < 2 || createMutation.isPending} onClick={() => createMutation.mutate()}><Plus className="size-4" />{ui('إضافة السبب')}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
