import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import type { ClubMemberListItem } from '@/types/club';

interface SubscriptionReceiptCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set from member details; omit on the receipts page to choose a member. */
  member?: ClubMemberListItem;
}

type ReceiptPaymentMethod = 'cash' | 'card' | 'transfer';

const paymentMethods: Array<{ value: ReceiptPaymentMethod; label: string }> = [
  { value: 'cash', label: 'نقدي' },
  { value: 'card', label: 'بطاقة' },
  { value: 'transfer', label: 'تحويل بنكي' },
];

interface ReceiptSaveResponse {
  receiptNumber: string;
}

export function SubscriptionReceiptCreateDialog({ open, onOpenChange, member }: SubscriptionReceiptCreateDialogProps) {
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(member ?? null);
  const [amount, setAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(localToday());
  const [paymentMethod, setPaymentMethod] = useState<ReceiptPaymentMethod>('cash');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setAmount('');
    setReceiptDate(localToday());
    setPaymentMethod('cash');
    setSelectedMember(member ?? null);
  }, [open, member?.id]);

  const save = async () => {
    if (!selectedMember) {
      toast.error('اختر العضو أولاً');
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('أدخل مبلغًا صحيحًا أكبر من صفر');
      return;
    }
    if (!receiptDate) {
      toast.error('تاريخ الدفع مطلوب');
      return;
    }

    setSaving(true);
    try {
      const memberFields = member
        ? {
            memberId: member.id,
            memberName: member.name,
            branchId: member.branchId,
          }
        : {
            memberId: selectedMember.id,
            memberName: selectedMember.name,
            branchId: selectedMember.branchId,
          };
      const { data: createdReceipt } = await api.post<ReceiptSaveResponse>('/club-receipts', {
        ...memberFields,
        amount: numericAmount,
        receiptDate,
        paymentMethod,
      });
      toast.success(`تم حفظ الإيصال برقم ${createdReceipt.receiptNumber}`);
      onOpenChange(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['club-receipts'] }),
        queryClient.invalidateQueries({ queryKey: ['club-members', selectedMember.id, 'workspace'] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>إضافة إيصال</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2"><Label>رقم الإيصال</Label><Input className="nums" readOnly value="يُنشأ تلقائيًا عند الحفظ" /></div>
          {!member ? (
            <div className="grid gap-2 sm:col-span-2"><Label>العضو</Label><MemberSearchCombobox selectedMember={selectedMember} onSelect={setSelectedMember} onClear={() => setSelectedMember(null)} /></div>
          ) : null}
          {member ? <>
            <div className="grid gap-2"><Label>كود العضو</Label><Input readOnly value={member.memberCode} /></div>
            <div className="grid gap-2"><Label>اسم العضو</Label><Input readOnly value={member.name} /></div>
            <div className="grid gap-2"><Label>رقم التليفون</Label><Input readOnly value={member.phone ?? '—'} /></div>
          </> : selectedMember ? <>
            <div className="grid gap-2"><Label>كود العضو</Label><Input readOnly value={selectedMember.memberCode} /></div>
            <div className="grid gap-2"><Label>اسم العضو</Label><Input readOnly value={selectedMember.name} /></div>
            <div className="grid gap-2"><Label>رقم التليفون</Label><Input readOnly value={selectedMember.phone ?? '—'} /></div>
          </> : null}
          <div className="grid gap-2"><Label>تاريخ الدفع</Label><Input type="date" className="nums" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></div>
          <div className="grid gap-2"><Label>المبلغ المدفوع</Label><Input type="number" min="0.01" step="0.01" className="nums" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>طريقة الدفع</Label>
            <select className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as ReceiptPaymentMethod)}>
              {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="brand" onClick={() => void save()} disabled={saving || !selectedMember}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
