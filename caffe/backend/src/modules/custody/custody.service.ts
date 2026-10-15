import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import {
  CreateCustodyDto,
  ListCustodyDto,
  TransferCustodyDto,
  UpdateCustodyDto,
} from './dto/custody.dto';

export interface DeviceNode {
  id: number;
  title: string | null;
  fromId: number | null;
  level: number | null;
  children: DeviceNode[];
}

@Injectable()
export class CustodyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListCustodyDto) {
    const and: Prisma.emp_custodyWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ custody_title: { contains: s } }] });
    }

    const where: Prisma.emp_custodyWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.emp_custody.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.emp_custody.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => {
        const emp = row.emp_code
          ? await this.prisma.employees.findUnique({ where: { id: row.emp_code } })
          : null;
        return {
          id: row.id,
          title: row.custody_title,
          employeeName: emp?.employee ?? '',
          createdAt: row.date_recived,
          empCode: row.emp_code,
          custodyId: row.custody_id_fk,
          num: row.num,
          status: row.status,
        };
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  async listDevices() {
    const rows = await this.prisma.custody_devices.findMany({ orderBy: { id: 'asc' } });
    return this.buildDeviceTree(rows);
  }

  async create(dto: CreateCustodyDto) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    if (dto.custodyId) {
      const dup = await this.prisma.emp_custody.findFirst({
        where: { custody_id_fk: dto.custodyId, status: 1, emp_code: { not: dto.empId } },
      });
      if (dup) throw new BadRequestException('الجهاز مُسلَّم بالفعل لموظف آخر');
    } else if (dto.custodyTitle?.trim()) {
      // Free-text custody (no catalog link) still must not be double-registered to the
      // same employee while active — otherwise the same item shows twice in their custody.
      const dupTitle = await this.prisma.emp_custody.findFirst({
        where: { emp_code: dto.empId, status: 1, custody_title: dto.custodyTitle.trim() },
      });
      if (dupTitle) throw new BadRequestException('هذه العهدة مسجّلة بالفعل لدى الموظف');
    }

    const row = await this.prisma.emp_custody.create({
      data: {
        emp_code: dto.empId,
        custody_id_fk: dto.custodyId,
        custody_title: dto.custodyTitle,
        num: dto.num,
        status: dto.status,
        date_recived: dto.dateReceived,
        transfered: 0,
      },
    });
    return { id: row.id };
  }

  async update(id: number, dto: UpdateCustodyDto) {
    await this.findOrThrow(id);
    await this.prisma.emp_custody.update({
      where: { id },
      data: {
        ...(dto.empId != null ? { emp_code: dto.empId } : {}),
        ...(dto.custodyId != null ? { custody_id_fk: dto.custodyId } : {}),
        ...(dto.custodyTitle != null ? { custody_title: dto.custodyTitle } : {}),
        ...(dto.num != null ? { num: dto.num } : {}),
        ...(dto.status != null ? { status: dto.status } : {}),
        ...(dto.dateReceived != null ? { date_recived: dto.dateReceived } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.emp_custody.delete({ where: { id } });
    return { id };
  }

  /**
   * Mark a custody item as returned. Status auto-flips to 0 (مُسترجعة) instead of the
   * owner having to hand-edit the status field — closes the "return is manual" gap.
   */
  async returnItem(id: number) {
    const row = await this.findOrThrow(id);
    if (row.status !== 1) {
      throw new BadRequestException('العهدة ليست مُسلّمة حتى تُسترجع');
    }
    await this.prisma.emp_custody.update({ where: { id }, data: { status: 0 } });
    return { id, status: 0 };
  }

  /**
   * Transfer a custody item between employees.
   * Faithful port of Custody_employee_model::transfer_operation:
   *  1) insert an emp_custody_transfer_operations history row
   *     (custody_id_fk, from_emp_code, to_emp_code, date, date_ar, date_s, publisher)
   *  2) flip the emp_custody row: transfered=1, emp_code = new owner.
   */
  async transfer(dto: TransferCustodyDto, publisherId?: number) {
    const custody = await this.findOrThrow(dto.custodyId);

    if (dto.fromEmpCode === dto.toEmpCode) {
      throw new BadRequestException('لا يمكن نقل العهدة لنفس الموظف');
    }

    // legacy uses the posted from_emp_code; guard against stale ownership.
    if (custody.emp_code != null && custody.emp_code !== dto.fromEmpCode) {
      throw new BadRequestException('العهدة غير مسجلة لدى الموظف المحوّل منه');
    }

    const fromEmp = await this.prisma.employees.findUnique({ where: { id: dto.fromEmpCode } });
    if (!fromEmp) throw new NotFoundException('الموظف المحوّل منه غير موجود');
    const toEmp = await this.prisma.employees.findUnique({ where: { id: dto.toEmpCode } });
    if (!toEmp) throw new NotFoundException('الموظف المحوّل إليه غير موجود');

    const dateStr = todayIso();
    const epochDay = Math.floor(new Date(dateStr).getTime() / 1000);
    const epochNow = Math.floor(Date.now() / 1000);
    const publisher = publisherId != null ? String(publisherId) : '0';

    // emp_custody_transfer_operations has no generated Prisma model yet (see RETURN);
    // the table exists + is seeded, so write the legacy history row via raw SQL.
    await this.prisma.$executeRaw`
      INSERT INTO emp_custody_transfer_operations
        (custody_id_fk, from_emp_code, to_emp_code, date, date_ar, date_s, publisher)
      VALUES
        (${dto.custodyId}, ${dto.fromEmpCode}, ${dto.toEmpCode}, ${epochDay}, ${dateStr}, ${epochNow}, ${publisher})
    `;

    // flip ownership (legacy update_transfer)
    await this.prisma.emp_custody.update({
      where: { id: dto.custodyId },
      data: { transfered: 1, emp_code: dto.toEmpCode, status: 1 },
    });

    return { id: dto.custodyId, toEmpCode: dto.toEmpCode };
  }

  /**
   * Transfer history for an employee (custody items this employee handed over).
   * Mirrors Custody_employee_model::getAllData_transfer.
   */
  async listTransfers(empCode: number) {
    const rows = await this.prisma.$queryRaw<
      {
        id: number;
        custody_id_fk: number;
        to_emp_code: number;
        date_ar: string;
        custody_title: string | null;
        num: number | null;
        status: number | null;
      }[]
    >`
      SELECT t.id, t.custody_id_fk, t.to_emp_code, t.date_ar,
             c.custody_title, c.num, c.status
      FROM emp_custody_transfer_operations t
      JOIN emp_custody c ON c.id = t.custody_id_fk
      WHERE t.from_emp_code = ${empCode}
      ORDER BY t.id DESC
    `;

    return Promise.all(
      rows.map(async (r) => {
        const toEmp = await this.prisma.employees.findUnique({ where: { id: r.to_emp_code } });
        return {
          id: r.id,
          custodyId: r.custody_id_fk,
          custodyTitle: r.custody_title,
          num: r.num,
          status: r.status,
          toEmpCode: r.to_emp_code,
          toEmployeeName: toEmp?.employee ?? '',
          date: r.date_ar,
        };
      }),
    );
  }

  private buildDeviceTree(
    rows: { id: number; title: string | null; from_id: number | null; level: number | null }[],
  ): DeviceNode[] {
    const map = new Map<number, DeviceNode>();
    for (const r of rows) {
      map.set(r.id, { id: r.id, title: r.title, fromId: r.from_id, level: r.level, children: [] });
    }
    const roots: DeviceNode[] = [];
    for (const node of map.values()) {
      if (node.fromId && map.has(node.fromId)) {
        map.get(node.fromId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.emp_custody.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('العهدة غير موجودة');
    return row;
  }
}
