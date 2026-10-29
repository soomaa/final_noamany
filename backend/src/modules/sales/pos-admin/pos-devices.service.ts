import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as net from 'net';
import { paginated } from '../../../common/dto/list-result';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PosListQueryDto, UpsertPosDeviceDto } from './dto/pos-admin.dto';
import { BranchScopeService } from '../../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../../common/types/jwt-user';
import { isSystemAdmin } from '../../../common/utils/system-admin.util';
import { InventoryLocationService } from '../../inventory/inventory-location.service';

export interface SyncDeviceResult {
  id: number;
  name: string;
  ok: boolean;
  message: string;
  latencyMs?: number;
}

@Injectable()
export class PosDevicesService {
  private readonly log = new Logger(PosDevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly location: InventoryLocationService,
  ) {}

  private scopeWhere(user?: JwtUser, requested?: number | null): Prisma.sales_pos_devicesWhereInput {
    const ids = user ? this.branchScope.resolveListFilter(user, requested ?? null) : (requested != null ? [requested] : null);
    return ids ? { branch_id: { in: ids } } : {};
  }

  /**
   * Validate the device's branch/warehouse pair: the branch must be in scope and the
   * warehouse must be an active location of an allowed branch (Tanta main may assign
   * Tanta Up/Down warehouses). Returns the branch to store.
   */
  private async resolveDeviceLocation(user: JwtUser | undefined, branchId: number | null | undefined, warehouseId: number | null | undefined) {
    if (!user) return branchId;
    if (branchId != null) this.branchScope.assertBranchAllowed(user, branchId, 'الفرع خارج الفروع المسموح بها');
    if (warehouseId != null) {
      const selected = await this.location.resolveSelection(user, warehouseId, branchId ?? undefined);
      return branchId ?? selected.branchId;
    }
    return branchId;
  }

  private map(row: {
    id: number; name: string; serial_number: string | null; device_type: string;
    branch_id: number | null; warehouse_id: number | null; cash_drawer_id: string | null;
    ip_address: string | null; printer_type: string; mac_address: string | null;
    operating_system: string | null; software_version: string | null; notes: string | null;
    is_active: boolean; last_sync: Date | null; created_at: Date;
  }) {
    return {
      id: row.id, name: row.name, serialNumber: row.serial_number,
      deviceType: row.device_type, branchId: row.branch_id, warehouseId: row.warehouse_id,
      cashDrawerId: row.cash_drawer_id, ipAddress: row.ip_address, printerType: row.printer_type,
      macAddress: row.mac_address, operatingSystem: row.operating_system,
      softwareVersion: row.software_version, notes: row.notes, isActive: row.is_active,
      lastSync: row.last_sync, createdAt: row.created_at,
    };
  }

  private pingHost(ip: string, port = 80, timeoutMs = 3000): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: ip, port, timeout: timeoutMs });
      const finish = (ok: boolean) => {
        socket.destroy();
        resolve({ ok, latencyMs: Date.now() - start });
      };
      socket.on('connect', () => finish(true));
      socket.on('error', () => finish(false));
      socket.on('timeout', () => finish(false));
    });
  }

  async list(q: PosListQueryDto, user?: JwtUser) {
    const where: Prisma.sales_pos_devicesWhereInput = { ...this.scopeWhere(user, q.branchId) };
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ name: { contains: s } }, { serial_number: { contains: s } }, { ip_address: { contains: s } }];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sales_pos_devices.count({ where }),
      this.prisma.sales_pos_devices.findMany({ where, skip: q.skip, take: q.take, orderBy: { name: 'asc' } }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.sales_pos_devices.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الجهاز غير موجود');
    if (user) this.branchScope.assertBranchAllowed(user, row.branch_id, 'لا تملك صلاحية الوصول لأجهزة فرع آخر');
    return this.map(row);
  }

  async create(dto: UpsertPosDeviceDto, userId: number, user?: JwtUser) {
    // A scoped user's device defaults to their own branch (or the chosen warehouse's branch).
    const defaultBranch = user && !isSystemAdmin(user) && dto.warehouseId == null ? Number(user.branch) || null : null;
    const branchId = await this.resolveDeviceLocation(user, dto.branchId ?? defaultBranch, dto.warehouseId);
    const row = await this.prisma.sales_pos_devices.create({
      data: {
        name: dto.name,
        serial_number: dto.serialNumber,
        device_type: (dto.deviceType as 'terminal') ?? 'terminal',
        branch_id: branchId ?? undefined,
        warehouse_id: dto.warehouseId,
        cash_drawer_id: dto.cashDrawerId,
        ip_address: dto.ipAddress,
        printer_type: (dto.printerType as 'thermal') ?? 'thermal',
        mac_address: dto.macAddress,
        operating_system: dto.operatingSystem,
        software_version: dto.softwareVersion,
        notes: dto.notes,
        is_active: dto.isActive ?? true,
        created_by: userId,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertPosDeviceDto>, userId: number, user?: JwtUser) {
    const existing = await this.findOne(id, user);
    if (dto.branchId !== undefined || dto.warehouseId !== undefined) {
      await this.resolveDeviceLocation(
        user,
        dto.branchId !== undefined ? dto.branchId : existing.branchId,
        dto.warehouseId !== undefined ? dto.warehouseId : existing.warehouseId,
      );
    }
    const row = await this.prisma.sales_pos_devices.update({
      where: { id },
      data: {
        name: dto.name,
        serial_number: dto.serialNumber,
        device_type: dto.deviceType as never,
        branch_id: dto.branchId,
        warehouse_id: dto.warehouseId,
        cash_drawer_id: dto.cashDrawerId,
        ip_address: dto.ipAddress,
        printer_type: dto.printerType as never,
        mac_address: dto.macAddress,
        operating_system: dto.operatingSystem,
        software_version: dto.softwareVersion,
        notes: dto.notes,
        is_active: dto.isActive,
        updated_by: userId,
      },
    });
    return this.map(row);
  }

  async remove(id: number, user?: JwtUser) {
    await this.findOne(id, user);
    await this.prisma.sales_pos_devices.delete({ where: { id } });
    return { ok: true };
  }

  async toggleStatus(id: number, userId: number, user?: JwtUser) {
    const row = await this.findOne(id, user);
    return this.update(id, { isActive: !row.isActive }, userId, user);
  }

  async syncAll(user?: JwtUser) {
    const devices = await this.prisma.sales_pos_devices.findMany({
      where: { is_active: true, ...this.scopeWhere(user) },
      orderBy: { name: 'asc' },
    });

    const results: SyncDeviceResult[] = [];
    for (const device of devices) {
      if (!device.ip_address?.trim()) {
        results.push({
          id: device.id,
          name: device.name,
          ok: false,
          message: 'لا يوجد عنوان IP — لم تتم المزامنة',
        });
        continue;
      }

      const probe = await this.pingHost(device.ip_address.trim());
      if (probe.ok) {
        await this.prisma.sales_pos_devices.update({
          where: { id: device.id },
          data: { last_sync: new Date() },
        });
        results.push({
          id: device.id,
          name: device.name,
          ok: true,
          message: 'تم الاتصال بالجهاز',
          latencyMs: probe.latencyMs,
        });
      } else {
        results.push({
          id: device.id,
          name: device.name,
          ok: false,
          message: `تعذّر الاتصال بـ ${device.ip_address}`,
          latencyMs: probe.latencyMs,
        });
      }
    }

    const synced = results.filter((r) => r.ok).length;
    if (synced < devices.length) {
      this.log.warn(`Device sync: ${synced}/${devices.length} reachable`);
    }

    return { synced, failed: devices.length - synced, total: devices.length, results, at: new Date() };
  }

  async stats(user?: JwtUser) {
    const scope = this.scopeWhere(user);
    const [total, active, byType] = await Promise.all([
      this.prisma.sales_pos_devices.count({ where: scope }),
      this.prisma.sales_pos_devices.count({ where: { is_active: true, ...scope } }),
      this.prisma.sales_pos_devices.groupBy({ by: ['device_type'], where: scope, _count: true }),
    ]);
    return { total, active, inactive: total - active, byType: Object.fromEntries(byType.map((b) => [b.device_type, b._count])) };
  }
}
