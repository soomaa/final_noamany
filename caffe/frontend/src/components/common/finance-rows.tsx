import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const METHOD_KEYS = [
  { value: 'fixed', labelKey: uiStatic('قيمة ثابتة') },
  { value: 'percent', labelKey: uiStatic('نسبة من الأساسي') },
  { value: 'days', labelKey: uiStatic('حسب الأيام') },
] as const;

export interface FinanceRow {
  id: string;
  badl_type: '1' | '2';
  badl_discount_id_fk: string;
  value: string;
  method_to_count: string;
  date_from: string;
  date_to: string;
  insurance_affect: boolean;
}

interface FinanceRowsEditorProps {
  rows: FinanceRow[];
  onChange: (rows: FinanceRow[]) => void;
  /** Optional custom delete handler (e.g. to call the DELETE endpoint for persisted rows). Falls back to local removal. */
  onDeleteRow?: (row: FinanceRow) => void;
  allowanceTypes?: { id: number; title: string }[];
  deductionTypes?: { id: number; title: string }[];
  basicSalary?: string;
  onBasicSalaryChange?: (v: string) => void;
}

function newRow(type: '1' | '2'): FinanceRow {
  return {
    id: crypto.randomUUID(),
    badl_type: type,
    badl_discount_id_fk: '',
    value: '',
    method_to_count: 'fixed',
    date_from: '',
    date_to: '',
    insurance_affect: false,
  };
}

export function FinanceRowsEditor({
  rows,
  onChange,
  onDeleteRow,
  allowanceTypes = [],
  deductionTypes = [],
  basicSalary,
  onBasicSalaryChange,
}: FinanceRowsEditorProps) {
  const { ui } = useLocale();
  const methods = useMemo(
    () => METHOD_KEYS.map((m) => ({ value: m.value, label: ui(m.labelKey) })),
    [ui],
  );
  const update = (id: string, patch: Partial<FinanceRow>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const remove = (row: FinanceRow) =>
    onDeleteRow ? onDeleteRow(row) : onChange(rows.filter((r) => r.id !== row.id));

  const renderSection = (type: '1' | '2', title: string, types: { id: number; title: string }[]) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{title}</h4>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, newRow(type)])}>
          <Plus className="size-4" /> {ui('إضافة')}
        </Button>
      </div>
      {rows.filter((r) => r.badl_type === type).length === 0 ? (
        <p className="text-sm text-muted-foreground">{ui('لا توجد بنود — انقر إضافة.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ui('النوع')}</TableHead>
                <TableHead>{ui('القيمة')}</TableHead>
                <TableHead>{ui('طريقة الاحتساب')}</TableHead>
                <TableHead>{ui('من')}</TableHead>
                <TableHead>{ui('إلى')}</TableHead>
                <TableHead>{ui('يؤثر على التأمين')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows
                .filter((r) => r.badl_type === type)
                .map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Combobox
                        value={row.badl_discount_id_fk}
                        onValueChange={(v) => update(row.id, { badl_discount_id_fk: v })}
                        options={types.map((t) => ({ value: String(t.id), label: t.title }))}
                        placeholder={ui('اختر النوع')}
                        searchPlaceholder={ui('بحث في الأنواع…')}
                      />
                    </TableCell>
                    <TableCell>
                      <Input value={row.value} onChange={(e) => update(row.id, { value: e.target.value })} className="nums w-24" />
                    </TableCell>
                    <TableCell>
                      <Select value={row.method_to_count} onValueChange={(v) => update(row.id, { method_to_count: v })}>
                        <SelectTrigger className="min-w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {methods.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input type="date" value={row.date_from} onChange={(e) => update(row.id, { date_from: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input type="date" value={row.date_to} onChange={(e) => update(row.id, { date_to: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={row.insurance_affect} onCheckedChange={(v) => update(row.id, { insurance_affect: v })} />
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(row)} aria-label={ui('حذف')}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {onBasicSalaryChange && (
        <div className="max-w-xs">
          <Label>{ui('الراتب الأساسي')}</Label>
          <Input value={basicSalary ?? ''} onChange={(e) => onBasicSalaryChange(e.target.value)} className="nums mt-1.5" />
        </div>
      )}
      {renderSection('1', ui('الاستحقاقات / البدلات'), allowanceTypes)}
      {renderSection('2', ui('الاستقطاعات'), deductionTypes)}
      <p className="text-xs text-muted-foreground">
        <a href="/settings/pay-components" className="text-primary hover:underline">
          {ui('إدارة تعريفات الاستحقاقات والاستقطاعات')}
        </a>
      </p>
    </div>
  );
}
