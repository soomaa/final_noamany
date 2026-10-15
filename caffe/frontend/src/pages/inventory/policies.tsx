import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/store/locale';
import { InventoryPageShell } from './inventory-shell';

const STORAGE_KEY = 'inv_policies_v1';

interface InventoryPolicies {
  allowNegativeStock: boolean;
  defaultReorderPoint: number;
  autoApproveOpeningStock: boolean;
  requireApprovalAbove: number;
}

const DEFAULTS: InventoryPolicies = {
  allowNegativeStock: false,
  defaultReorderPoint: 10,
  autoApproveOpeningStock: false,
  requireApprovalAbove: 5000,
};

function load(): InventoryPolicies {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function InventoryPoliciesPage() {
  const { ui } = useLocale();
  const [form, setForm] = useState<InventoryPolicies>(load);
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      // No backend endpoint exists for inventory policies yet — persistence is local to this browser only.
      toast.success(ui('تم حفظ السياسات على هذا الجهاز فقط'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryPageShell title={ui('السياسات والإجراءات')} description={ui('قواعد المخزون والاعتمادات (محفوظة محلياً على هذا الجهاز)')}>
      <div className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-6">
        <div className="flex items-center gap-3">
          <input
            id="neg"
            type="checkbox"
            checked={form.allowNegativeStock}
            onChange={(e) => setForm((f) => ({ ...f, allowNegativeStock: e.target.checked }))}
          />
          <Label htmlFor="neg">{ui('السماح بالبيع عند نفاد المخزون (طلبات معلّقة)')}</Label>
        </div>
        <div className="grid gap-2">
          <Label>{ui('حد إعادة الطلب الافتراضي')}</Label>
          <Input
            type="number"
            className="nums max-w-xs"
            value={form.defaultReorderPoint}
            onChange={(e) => setForm((f) => ({ ...f, defaultReorderPoint: Number(e.target.value) }))}
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            id="auto"
            type="checkbox"
            checked={form.autoApproveOpeningStock}
            onChange={(e) => setForm((f) => ({ ...f, autoApproveOpeningStock: e.target.checked }))}
          />
          <Label htmlFor="auto">{ui('اعتماد الرصيد الافتتاحي تلقائياً عند الإنشاء')}</Label>
        </div>
        <div className="grid gap-2">
          <Label>{ui('يتطلب اعتماداً إدارياً للحركات فوق (جنيه)')}</Label>
          <Input
            type="number"
            className="nums max-w-xs"
            value={form.requireApprovalAbove}
            onChange={(e) => setForm((f) => ({ ...f, requireApprovalAbove: Number(e.target.value) }))}
          />
        </div>
        <Button onClick={save} disabled={saving}>
          {ui('حفظ السياسات')}
        </Button>
      </div>
    </InventoryPageShell>
  );
}
