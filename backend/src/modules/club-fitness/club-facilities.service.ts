import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDateOrder } from '../../common/validators';
import { paginated } from '../../common/dto/list-result';
import { localDateString, toNum } from './club-fitness.utils';
import { ListClubFitnessDto } from './dto/list-club-fitness.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { recordSystemExpense } from '../finance/system-expense.util';

@Injectable()
export class ClubFacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  // --- Facilities ---

  async listFacilities(q: ListClubFitnessDto) {
    const where: Prisma.club_facilitiesWhereInput = { is_active: true };
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    if (q.search?.trim()) where.name = { contains: q.search.trim() };

    const [rows, total] = await Promise.all([
      this.prisma.club_facilities.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_facilities.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        branchId: r.branch_id,
        facilityType: r.facility_type,
        capacity: r.capacity,
        description: r.description,
        status: r.status,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findFacility(id: number) {
    const row = await this.prisma.club_facilities.findFirst({
      where: { id, is_active: true },
    });
    if (!row) throw new NotFoundException('المنشأة غير موجودة');
    return {
      id: row.id,
      name: row.name,
      branchId: row.branch_id,
      facilityType: row.facility_type,
      capacity: row.capacity,
      description: row.description,
      status: row.status,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createFacility(body: Record<string, unknown>) {
    if (!body.name || !body.branchId) {
      throw new BadRequestException('اسم المنشأة والفرع مطلوبان');
    }
    const row = await this.prisma.club_facilities.create({
      data: {
        name: String(body.name).trim(),
        branch_id: Number(body.branchId),
        facility_type: body.facilityType ? String(body.facilityType) : 'general',
        capacity: body.capacity != null ? Number(body.capacity) : null,
        description: body.description ? String(body.description) : null,
        status: (body.status as Prisma.EnumClubFitnessHallStatusFieldUpdateOperationsInput['set']) ?? 'available',
        is_active: body.isActive !== false,
      },
    });
    return this.findFacility(row.id);
  }

  async updateFacility(id: number, body: Record<string, unknown>) {
    await this.findFacility(id);
    await this.prisma.club_facilities.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
        ...(body.facilityType != null ? { facility_type: String(body.facilityType) } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity != null ? Number(body.capacity) : null } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.status != null ? { status: String(body.status) as Prisma.EnumClubFitnessHallStatusFieldUpdateOperationsInput['set'] } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findFacility(id);
  }

  async removeFacility(id: number) {
    await this.findFacility(id);
    await this.prisma.club_facilities.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }

  // --- Equipment ---

  async listEquipment(q: ListClubFitnessDto) {
    const where: Prisma.club_equipmentWhereInput = { is_active: true };
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ name: { contains: s } }, { serial_number: { contains: s } }];
    }

    const [rows, total] = await Promise.all([
      this.prisma.club_equipment.findMany({
        where,
        include: { facility: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_equipment.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        facilityId: r.facility_id,
        name: r.name,
        serialNumber: r.serial_number,
        branchId: r.branch_id,
        status: r.status,
        purchaseDate: r.purchase_date,
        notes: r.notes,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        facility: r.facility,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findEquipment(id: number) {
    const row = await this.prisma.club_equipment.findFirst({
      where: { id, is_active: true },
      include: { facility: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException('المعدة غير موجودة');
    return {
      id: row.id,
      facilityId: row.facility_id,
      name: row.name,
      serialNumber: row.serial_number,
      branchId: row.branch_id,
      status: row.status,
      purchaseDate: row.purchase_date,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      facility: row.facility,
    };
  }

  async createEquipment(body: Record<string, unknown>) {
    if (!body.name || !body.branchId) {
      throw new BadRequestException('اسم المعدة والفرع مطلوبان');
    }
    const row = await this.prisma.club_equipment.create({
      data: {
        facility_id: body.facilityId != null ? Number(body.facilityId) : null,
        name: String(body.name).trim(),
        serial_number: body.serialNumber ? String(body.serialNumber) : null,
        branch_id: Number(body.branchId),
        status: (body.status as Prisma.EnumClubFitnessHallStatusFieldUpdateOperationsInput['set']) ?? 'available',
        purchase_date: body.purchaseDate ? String(body.purchaseDate) : null,
        notes: body.notes ? String(body.notes) : null,
        is_active: body.isActive !== false,
      },
      include: { facility: { select: { id: true, name: true } } },
    });
    return this.findEquipment(row.id);
  }

  async updateEquipment(id: number, body: Record<string, unknown>) {
    await this.findEquipment(id);
    await this.prisma.club_equipment.update({
      where: { id },
      data: {
        ...(body.facilityId !== undefined ? { facility_id: body.facilityId != null ? Number(body.facilityId) : null } : {}),
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.serialNumber !== undefined ? { serial_number: body.serialNumber ? String(body.serialNumber) : null } : {}),
        ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
        ...(body.status != null ? { status: String(body.status) as Prisma.EnumClubFitnessHallStatusFieldUpdateOperationsInput['set'] } : {}),
        ...(body.purchaseDate !== undefined ? { purchase_date: body.purchaseDate ? String(body.purchaseDate) : null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findEquipment(id);
  }

  async removeEquipment(id: number) {
    await this.findEquipment(id);
    await this.prisma.club_equipment.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }

  // --- Equipment maintenance ---

  async listMaintenance(q: ListClubFitnessDto, equipmentId?: string) {
    const where: Prisma.club_equipment_maintenanceWhereInput = {};
    if (equipmentId) where.equipment_id = Number(equipmentId);

    const [rows, total] = await Promise.all([
      this.prisma.club_equipment_maintenance.findMany({
        where,
        include: { equipment: { select: { id: true, name: true, serial_number: true } } },
        orderBy: { scheduled_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_equipment_maintenance.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        equipmentId: r.equipment_id,
        scheduledDate: r.scheduled_date,
        completedDate: r.completed_date,
        description: r.description,
        cost: r.cost != null ? toNum(r.cost) : null,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        equipment: r.equipment,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findMaintenance(id: number) {
    const row = await this.prisma.club_equipment_maintenance.findUnique({
      where: { id },
      include: { equipment: { select: { id: true, name: true, serial_number: true } } },
    });
    if (!row) throw new NotFoundException('سجل الصيانة غير موجود');
    return {
      id: row.id,
      equipmentId: row.equipment_id,
      scheduledDate: row.scheduled_date,
      completedDate: row.completed_date,
      description: row.description,
      cost: row.cost != null ? toNum(row.cost) : null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      equipment: row.equipment,
    };
  }

  async createMaintenance(body: Record<string, unknown>, userId?: number) {
    if (!body.equipmentId || !body.scheduledDate) {
      throw new BadRequestException('المعدة وتاريخ الصيانة مطلوبان');
    }
    const equipment = await this.prisma.club_equipment.findFirst({
      where: { id: Number(body.equipmentId), is_active: true },
    });
    if (!equipment) throw new NotFoundException('المعدة غير موجودة');
    const scheduledDate = String(body.scheduledDate);
    const completedDate = body.completedDate ? String(body.completedDate) : null;
    if (completedDate) assertDateOrder(scheduledDate, completedDate, 'تاريخ الإتمام يجب أن يكون بعد تاريخ الجدولة');
    const cost = body.cost != null ? Number(body.cost) : 0;
    if (!Number.isFinite(cost) || cost < 0) throw new BadRequestException('تكلفة الصيانة غير صالحة');
    const status = body.status ? String(body.status) : 'scheduled';
    if (status === 'completed' && cost > 0) await this.moduleLedger.ensureChart();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club_equipment_maintenance.create({
        data: {
          equipment_id: Number(body.equipmentId),
          scheduled_date: scheduledDate,
          completed_date: completedDate,
          description: body.description ? String(body.description) : null,
          cost: body.cost != null ? cost : null,
          status,
        },
      });
      if (status === 'completed' && cost > 0) {
        await this.moduleLedger.postMaintenanceExpense(
          {
            maintenanceId: created.id,
            branchId: equipment.branch_id,
            date: completedDate ?? scheduledDate,
            amount: cost,
            createdBy: userId,
          },
          tx,
        );
        await recordSystemExpense(tx, {
          invoiceNumber: `MAINT-${created.id}`,
          date: completedDate ?? scheduledDate,
          category: 'صيانة',
          subCategory: 'صيانة أجهزة الجيم',
          amount: cost,
          description: `مصروف صيانة رقم ${created.id}`,
          vendor: equipment.name,
          branchId: equipment.branch_id,
          createdBy: userId,
        });
      }
      return created;
    });
    return this.findMaintenance(row.id);
  }

  async updateMaintenance(id: number, body: Record<string, unknown>, userId?: number) {
    const existing = await this.findMaintenance(id);
    const scheduledDate = body.scheduledDate != null ? String(body.scheduledDate) : existing.scheduledDate;
    const completedDate =
      body.completedDate !== undefined
        ? body.completedDate
          ? String(body.completedDate)
          : null
        : existing.completedDate;
    if (completedDate) {
      assertDateOrder(scheduledDate, completedDate, 'تاريخ الإتمام يجب أن يكون بعد تاريخ الجدولة');
    }
    const nextStatus = body.status != null ? String(body.status) : existing.status;
    const nextCost = body.cost !== undefined ? (body.cost != null ? Number(body.cost) : 0) : (existing.cost ?? 0);
    if (!Number.isFinite(nextCost) || nextCost < 0) throw new BadRequestException('تكلفة الصيانة غير صالحة');
    if (
      existing.status === 'completed' &&
      (body.cost !== undefined || body.equipmentId !== undefined || (body.status != null && nextStatus !== 'completed'))
    ) {
      throw new BadRequestException('لا يمكن تغيير المعدة أو التكلفة بعد اعتماد الصيانة');
    }
    const equipmentId = body.equipmentId != null ? Number(body.equipmentId) : existing.equipmentId;
    const equipment = await this.prisma.club_equipment.findFirst({ where: { id: equipmentId, is_active: true } });
    if (!equipment) throw new NotFoundException('المعدة غير موجودة');
    if (nextStatus === 'completed' && nextCost > 0) await this.moduleLedger.ensureChart();

    await this.prisma.$transaction(async (tx) => {
      await tx.club_equipment_maintenance.update({
        where: { id },
        data: {
          ...(body.equipmentId != null ? { equipment_id: Number(body.equipmentId) } : {}),
          ...(body.scheduledDate != null ? { scheduled_date: scheduledDate } : {}),
          ...(body.completedDate !== undefined ? { completed_date: completedDate } : {}),
          ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
          ...(body.cost !== undefined ? { cost: body.cost != null ? Number(body.cost) : null } : {}),
          ...(body.status != null ? { status: nextStatus } : {}),
        },
      });
      if (nextStatus === 'completed' || (completedDate && nextStatus !== 'scheduled')) {
        await tx.club_equipment.update({
          where: { id: equipmentId },
          data: { status: 'available' },
        });
      }
      if (nextStatus === 'completed' && nextCost > 0) {
        await this.moduleLedger.postMaintenanceExpense(
          {
            maintenanceId: id,
            branchId: equipment.branch_id,
            date: completedDate ?? scheduledDate,
            amount: nextCost,
            createdBy: userId,
          },
          tx,
        );
        await recordSystemExpense(tx, {
          invoiceNumber: `MAINT-${id}`,
          date: completedDate ?? scheduledDate,
          category: 'صيانة',
          subCategory: 'صيانة أجهزة الجيم',
          amount: nextCost,
          description: `مصروف صيانة رقم ${id}`,
          vendor: equipment.name,
          branchId: equipment.branch_id,
          createdBy: userId,
        });
      }
    });
    return this.findMaintenance(id);
  }

  async removeMaintenance(id: number) {
    const existing = await this.findMaintenance(id);
    if (existing.status === 'completed' && (existing.cost ?? 0) > 0) {
      throw new BadRequestException('لا يمكن حذف صيانة مرحّلة محاسبيًا');
    }
    await this.prisma.club_equipment_maintenance.delete({ where: { id } });
    return { success: true };
  }
}
