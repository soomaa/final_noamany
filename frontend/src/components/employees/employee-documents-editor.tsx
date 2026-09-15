import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/common/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FileDropzone } from '@/components/common/file-dropzone';
import { DualDateField } from '@/components/common/form-fields';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

export interface EmployeeDocumentRow {
  id: string;
  title: string;
  /** Newly selected binary (uploaded on save). */
  file: File | null;
  /** Already-uploaded path (emp_file) for documents loaded from the API. */
  filePath?: string;
  have_date: boolean;
  from_date: string;
  to_date: string;
  tanbih: boolean;
  period: string;
}

const DOC_TYPES = [
  uiStatic('عقد عمل'),
  uiStatic('صورة البطاقة'),
  uiStatic('جواز سفر'),
  uiStatic('شهادة'),
  uiStatic('رخصة'),
  uiStatic('مستند طبي'),
  uiStatic('أخرى'),
];

const PERIODS = [
  { value: '1', label: uiStatic('يوم') },
  { value: '7', label: uiStatic('أسبوع') },
  { value: '15', label: uiStatic('أسبوعين') },
  { value: '30', label: uiStatic('شهر') },
];

function newDoc(): EmployeeDocumentRow {
  return {
    id: crypto.randomUUID(),
    title: '',
    file: null,
    have_date: false,
    from_date: '',
    to_date: '',
    tanbih: false,
    period: '30',
  };
}

interface EmployeeDocumentsEditorProps {
  documents: EmployeeDocumentRow[];
  onChange: (docs: EmployeeDocumentRow[]) => void;
}

export function EmployeeDocumentsEditor({ documents, onChange }: EmployeeDocumentsEditorProps) {
  const { ui } = useLocale();
  const update = (id: string, patch: Partial<EmployeeDocumentRow>) => {
    onChange(documents.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...documents, newDoc()])}>
          <Plus className="size-4" /> {ui('إضافة مستند')}
        </Button>
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ui('لا توجد مستندات — أضف مرفقات الموظف.')}</p>
      ) : (
        documents.map((doc) => (
          <div key={doc.id} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>{ui('عنوان المستند')}</Label>
                  <Select value={doc.title} onValueChange={(v) => update(doc.id, { title: v })}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder={ui('نوع المستند')} />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={doc.have_date} onCheckedChange={(v) => update(doc.id, { have_date: v })} id={`date-${doc.id}`} />
                    <Label htmlFor={`date-${doc.id}`}>{ui('له تاريخ صلاحية')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={doc.tanbih} onCheckedChange={(v) => update(doc.id, { tanbih: v })} id={`tanbih-${doc.id}`} />
                    <Label htmlFor={`tanbih-${doc.id}`}>{ui('تنبيه قبل الانتهاء')}</Label>
                  </div>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(documents.filter((d) => d.id !== doc.id))}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
            {doc.have_date && (
              <div className="grid gap-3 sm:grid-cols-2">
                <DualDateField label={ui('من')} gregorianValue={doc.from_date} onGregorianChange={(v) => update(doc.id, { from_date: v })} showHijri={false} />
                <DualDateField label={ui('إلى')} gregorianValue={doc.to_date} onGregorianChange={(v) => update(doc.id, { to_date: v })} showHijri={false} />
              </div>
            )}
            {doc.tanbih && (
              <div className="max-w-xs">
                <Label>{ui('فترة التنبيه')}</Label>
                <Select value={doc.period} onValueChange={(v) => update(doc.id, { period: v })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {doc.filePath && !doc.file && (
              <a
                href={`/uploads/${doc.filePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm text-primary hover:underline"
              >
                {ui('عرض المرفق الحالي')}
              </a>
            )}
            <FileDropzone value={doc.file} onChange={(f) => update(doc.id, { file: f })} accept="image/*,.pdf,.doc,.docx" />
          </div>
        ))
      )}
    </div>
  );
}

interface BankAccountFormProps {
  bankId: string;
  accountNum: string;
  bankName: string;
  ibanFile: File | null;
  imagePath?: string;
  approvedForSarf: boolean;
  onChange: (patch: Partial<{ bankId: string; accountNum: string; bankName: string; ibanFile: File | null; imagePath: string; approvedForSarf: boolean }>) => void;
  banks?: { id: number; title: string }[];
}

export function BankAccountForm({ bankId, accountNum, bankName, ibanFile, imagePath, approvedForSarf, onChange, banks = [] }: BankAccountFormProps) {
  const { ui } = useLocale();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Label>{ui('البنك')}</Label>
        <div className="mt-1.5">
          <Combobox
            value={bankId}
            onValueChange={(v) => onChange({ bankId: v })}
            options={banks.map((b) => ({ value: String(b.id), label: b.title }))}
            placeholder={ui('اختر البنك')}
            searchPlaceholder={ui('بحث في البنوك…')}
          />
        </div>
      </div>
      <div>
        <Label>{ui('اسم صاحب الحساب')}</Label>
        <Input className="mt-1.5" value={bankName} onChange={(e) => onChange({ bankName: e.target.value })} />
      </div>
      <div>
        <Label>{ui('رقم الحساب / IBAN')}</Label>
        <Input className="mt-1.5 nums" value={accountNum} onChange={(e) => onChange({ accountNum: e.target.value })} />
      </div>
      <div className="flex items-center gap-2 pt-6">
        <Switch checked={approvedForSarf} onCheckedChange={(v) => onChange({ approvedForSarf: v })} id="approved-sarf" />
        <Label htmlFor="approved-sarf">{ui('معتمد للصرف')}</Label>
      </div>
      <div className="md:col-span-2">
        <Label>{ui('صورة الآيبان / شهادة البنك')}</Label>
        <div className="mt-1.5">
          <FileDropzone value={ibanFile} onChange={(f) => onChange({ ibanFile: f })} accept="image/*,.pdf" />
        </div>
        {imagePath && imagePath !== '0' && !ibanFile && (
          <a
            href={`/uploads/${imagePath}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            {ui('عرض صورة الآيبان الحالية')}
          </a>
        )}
      </div>
    </div>
  );
}

export function useBankState() {
  const [state, setState] = useState({
    bankId: '',
    accountNum: '',
    bankName: '',
    ibanFile: null as File | null,
    imagePath: '',
    approvedForSarf: false,
  });
  return [state, (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }))] as const;
}
