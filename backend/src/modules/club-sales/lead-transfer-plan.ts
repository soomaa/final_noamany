import { BadRequestException } from '@nestjs/common';

export function servesSalesBranch(rep: { branchId?: number | null; branchIds?: number[] }, branchId: number | null) {
  if (branchId == null) return false;
  return (rep.branchIds?.length ? rep.branchIds : rep.branchId ? [rep.branchId] : []).includes(branchId);
}

export function planLeadTransfer(leads: Array<{ id: number; branch_id: number | null }>, pool: Array<{ id: number; branchId?: number | null; branchIds?: number[] }>, mode: 'auto' | 'manual', targetId?: number) {
  if (mode === 'manual' && !pool.some(rep => rep.id === targetId)) throw new BadRequestException('اختر أخصائي مبيعات نشط لاستلام العملاء');
  const assigned = new Map<number, number>();
  return leads.map(lead => {
    const eligible = pool.filter(rep => (mode !== 'manual' || rep.id === targetId) && servesSalesBranch(rep, lead.branch_id));
    eligible.sort((a, b) => (assigned.get(a.id) ?? 0) - (assigned.get(b.id) ?? 0) || a.id - b.id);
    const target = eligible[0];
    if (!target) throw new BadRequestException(`لا يوجد أخصائي مستلم يغطي الفرع #${lead.branch_id}؛ لم يتم نقل أي عميل`);
    assigned.set(target.id, (assigned.get(target.id) ?? 0) + 1);
    return { leadId: lead.id, targetId: target.id };
  });
}
