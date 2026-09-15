import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

type InventoryQuery = { branchId?: number; status?: string; dateFrom?: string; dateTo?: string };
const INVENTORY_STATUSES = ['draft', 'finalized', 'approved', 'rejected'] as const;
const LOCKER_STATUSES = ['available', 'occupied', 'damaged', 'unavailable'] as const;

function dateOnly(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) throw new BadRequestException('تاريخ الجرد غير صحيح');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException('تاريخ الجرد غير صحيح');
  return parsed;
}

@Injectable()
export class LockerInventoryService {
  constructor(private readonly prisma: PrismaService, private readonly branchScope: BranchScopeService) {}
  private db() { return this.prisma as unknown as Record<string, any>; }
  private assertBranch(user: JwtUser, branchId: number) { if (!this.branchScope.isBranchAllowed(user, branchId)) throw new ForbiddenException('لا يمكنك الوصول لهذا الفرع'); }
  async list(query: InventoryQuery, user: JwtUser) {
    const where: Record<string, unknown> = {};
    if (query.branchId != null) { this.assertBranch(user, Number(query.branchId)); where.branch_id = Number(query.branchId); }
    else { const allowed = this.branchScope.resolveListFilter(user); if (allowed !== null) where.branch_id = { in: allowed }; }
    if (query.status) {
      if (!INVENTORY_STATUSES.includes(query.status as any)) throw new BadRequestException('حالة جلسة الجرد غير صحيحة');
      where.status = query.status;
    }
    if (query.dateFrom || query.dateTo) where.inventory_date = {
      ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}),
    };
    return this.db().club_locker_inventory_sessions.findMany({ where, orderBy: [{ inventory_date: 'desc' }, { id: 'desc' }] });
  }
  async detail(id: number, user: JwtUser) {
    const row = await this.require(id); this.assertBranch(user, row.branch_id);
    const lines = await this.db().club_locker_inventory_lines.findMany({ where: { session_id: id }, orderBy: { locker_id: 'asc' } });
    const lockerIds = lines.map((line: any) => line.locker_id);
    const lockers = lockerIds.length ? await this.db().club_lockers.findMany({ where: { id: { in: lockerIds } }, select: { id: true, locker_number: true } }) : [];
    const lockerById = new Map<number, any>(lockers.map((locker: any) => [locker.id, locker]));
    const data = lines.map((line: any) => ({ ...line, lockerNumber: lockerById.get(line.locker_id)?.locker_number ?? String(line.locker_id), hasDifference: line.expected_status !== line.actual_status }));
    return { ...row, lines: data, totals: { counted: data.length, differences: data.filter((line: any) => line.hasDifference).length } };
  }
  async createDraft(input: { branchId: number; inventoryDate: string; notes?: string }, user: JwtUser) {
    const inventoryDate = dateOnly(input.inventoryDate);
    this.assertBranch(user, input.branchId);
    const store = this.db().club_locker_inventory_sessions;
    const exists = await store.findFirst({ where: { branch_id: input.branchId, inventory_date: inventoryDate } });
    if (exists) throw new BadRequestException('يوجد جرد لهذا الفرع والتاريخ');
    return store.create({ data: { branch_id: input.branchId, inventory_date: inventoryDate, status: 'draft', notes: input.notes?.trim() || null, created_by: user.sub } });
  }
  async finalize(id: number, user: JwtUser) {
    const row = await this.require(id); this.assertBranch(user, row.branch_id);
    if (row.status !== 'draft') throw new BadRequestException('يمكن إنهاء مسودة الجرد فقط');
    const lines = await this.db().club_locker_inventory_lines.findMany({ where: { session_id: id }, select: { id: true } });
    if (!lines.length) throw new BadRequestException('لا يمكن إنهاء الجرد قبل إدخال حالة لوكر واحد على الأقل');
    return this.db().club_locker_inventory_sessions.update({ where: { id }, data: { status: 'finalized', finalized_by: user.sub, finalized_at: new Date() } });
  }
  async review(id: number, action: 'approve' | 'reject', user: JwtUser) {
    if (!['approve', 'reject'].includes(action)) throw new BadRequestException('إجراء المراجعة غير صحيح');
    const row = await this.require(id); this.assertBranch(user, row.branch_id);
    if (row.status !== 'finalized') throw new BadRequestException('لا يمكن اعتماد الجرد قبل إنهائه');
    return this.db().club_locker_inventory_sessions.update({ where: { id }, data: { status: action === 'approve' ? 'approved' : 'rejected', reviewed_by: user.sub, reviewed_at: new Date() } });
  }
  async upsertLine(sessionId: number, input: { lockerId: number; actualStatus: string; notes?: string }, user: JwtUser) {
    const row = await this.require(sessionId); this.assertBranch(user, row.branch_id);
    if (row.status !== 'draft') throw new BadRequestException('لا يمكن تعديل جرد منتهٍ');
    if (!LOCKER_STATUSES.includes(input.actualStatus as any)) throw new BadRequestException('حالة اللوكر الفعلية غير صحيحة');
    const locker = await this.db().club_lockers.findUnique({ where: { id: input.lockerId } });
    if (!locker) throw new NotFoundException('اللوكر غير موجود');
    if (locker.main_branch_id !== row.branch_id && locker.sub_branch_id !== row.branch_id) throw new ForbiddenException('اللوكر لا يتبع فرع جلسة الجرد');
    const expectedStatus = locker.is_available ? 'available' : 'occupied';
    return this.db().club_locker_inventory_lines.upsert({
      where: { session_id_locker_id: { session_id: sessionId, locker_id: input.lockerId } },
      create: { session_id: sessionId, locker_id: input.lockerId, expected_status: expectedStatus, actual_status: input.actualStatus, notes: input.notes?.trim() || null },
      update: { expected_status: expectedStatus, actual_status: input.actualStatus, notes: input.notes?.trim() || null },
    });
  }
  private async require(id: number) { const row = await this.db().club_locker_inventory_sessions.findUnique({ where: { id } }); if (!row) throw new NotFoundException('جلسة الجرد غير موجودة'); return row; }
}
