import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

const DAWABT_TYPE_NAMES = ['', 'ضبط الاستحقاق', 'ألية استرداد القرض/السلفة ', ' المستندات المطلوبة'];

@Injectable()
export class LoanSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDawabt(q: PaginationDto) {
    const where: Prisma.hr_solaf_dawabtWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ title: { contains: s } }, { type_n: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.hr_solaf_dawabt.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_solaf_dawabt.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title ?? '',
      employeeName: r.type_n ?? '',
      createdAt: '',
      type: r.type,
      typeName: r.type_n,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async getMain() {
    const row = await this.prisma.hr_solaf_main_setting.findUnique({ where: { id: 1 } });
    if (!row) throw new NotFoundException('إعدادات السلف الرئيسية غير موجودة');
    return row;
  }

  async updateMain(body: {
    da3mValue?: number;
    aqsaModaSadad?: number;
    hadAdna?: number;
    ratebAsasy?: number;
    bdlSakn?: number;
    bdlMowaslat?: number;
    bdlJwal?: number;
    ratebMokto3?: number;
    bdlAmal?: number;
    bdlTaklef?: number;
    bdlMa3esha?: number;
  }) {
    await this.getMain();
    await this.prisma.hr_solaf_main_setting.update({
      where: { id: 1 },
      data: {
        ...(body.da3mValue != null ? { da3m_value: body.da3mValue } : {}),
        ...(body.aqsaModaSadad != null ? { aqsa_moda_sadad: body.aqsaModaSadad } : {}),
        ...(body.hadAdna != null ? { had_adna: body.hadAdna } : {}),
        ...(body.ratebAsasy != null ? { rateb_asasy: body.ratebAsasy } : {}),
        ...(body.bdlSakn != null ? { bdl_sakn: body.bdlSakn } : {}),
        ...(body.bdlMowaslat != null ? { bdl_mowaslat: body.bdlMowaslat } : {}),
        ...(body.bdlJwal != null ? { bdl_jwal: body.bdlJwal } : {}),
        ...(body.ratebMokto3 != null ? { rateb_mokto3: body.ratebMokto3 } : {}),
        ...(body.bdlAmal != null ? { bdl_amal: body.bdlAmal } : {}),
        ...(body.bdlTaklef != null ? { bdl_taklef: body.bdlTaklef } : {}),
        ...(body.bdlMa3esha != null ? { bdl_ma3esha: body.bdlMa3esha } : {}),
      },
    });
    return { id: 1 };
  }

  async createDawabt(body: { title: string; type: number }) {
    const row = await this.prisma.hr_solaf_dawabt.create({
      data: {
        title: body.title,
        type: body.type,
        type_n: DAWABT_TYPE_NAMES[body.type] ?? '',
      },
    });
    return { id: row.id };
  }

  async updateDawabt(id: number, body: { title?: string; type?: number }) {
    await this.findDawabtOrThrow(id);
    const typeN = body.type != null ? (DAWABT_TYPE_NAMES[body.type] ?? '') : undefined;
    await this.prisma.hr_solaf_dawabt.update({
      where: { id },
      data: {
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.type != null ? { type: body.type, type_n: typeN } : {}),
      },
    });
    return { id };
  }

  async removeDawabt(id: number) {
    await this.findDawabtOrThrow(id);
    await this.prisma.hr_solaf_dawabt.delete({ where: { id } });
    return { id };
  }

  async listAccounts(q: PaginationDto) {
    const where: Prisma.hr_solaf_emp_hesbatWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ emp_name: { contains: s } }, { hesab_name: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.hr_solaf_emp_hesbat.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_solaf_emp_hesbat.count({ where }),
    ]);
    const empIds = [...new Set(rows.map((r) => r.emp_id).filter((id): id is number => id != null))];
    const employees =
      empIds.length > 0
        ? await this.prisma.employees.findMany({ where: { id: { in: empIds } }, select: { id: true, employee: true } })
        : [];
    const empMap = new Map(employees.map((e) => [e.id, e.employee]));
    const data = rows.map((r) => ({
      id: r.id,
      title: r.hesab_name ?? String(r.rkm_hesab ?? ''),
      employeeName: (r.emp_id != null ? empMap.get(r.emp_id) : null) ?? r.emp_name ?? '',
      createdAt: r.date_added ?? '',
      empId: r.emp_id,
      empCode: r.emp_code,
      accountNumber: r.rkm_hesab != null ? String(r.rkm_hesab) : null,
      accountName: r.hesab_name,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async createAccount(
    body: { empId: number; empCode?: number; empName?: string; accountNumber: string; accountName: string },
    publisherId?: number,
    publisherName?: string | null,
  ) {
    const emp = await this.prisma.employees.findUnique({ where: { id: body.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const now = new Date();
    const row = await this.prisma.hr_solaf_emp_hesbat.create({
      data: {
        emp_id: emp.id,
        emp_code: body.empCode ?? emp.emp_code ?? undefined,
        emp_name: body.empName ?? emp.employee ?? undefined,
        rkm_hesab: BigInt(body.accountNumber),
        hesab_name: body.accountName,
        publisher: publisherId,
        publisher_name: publisherName,
        date_added: now.toISOString().slice(0, 10),
        time_add: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      },
    });
    return { id: row.id };
  }

  async updateAccount(
    id: number,
    body: { empId?: number; empCode?: number; empName?: string; accountNumber?: string; accountName?: string },
  ) {
    await this.findAccountOrThrow(id);
    let empData: { emp_id?: number; emp_code?: number; emp_name?: string } = {};
    if (body.empId != null) {
      const emp = await this.prisma.employees.findUnique({ where: { id: body.empId } });
      if (!emp) throw new NotFoundException('الموظف غير موجود');
      empData = {
        emp_id: emp.id,
        emp_code: body.empCode ?? emp.emp_code ?? undefined,
        emp_name: body.empName ?? emp.employee ?? undefined,
      };
    }
    await this.prisma.hr_solaf_emp_hesbat.update({
      where: { id },
      data: {
        ...empData,
        ...(body.accountNumber != null ? { rkm_hesab: BigInt(body.accountNumber) } : {}),
        ...(body.accountName != null ? { hesab_name: body.accountName } : {}),
      },
    });
    return { id };
  }

  async removeAccount(id: number) {
    await this.findAccountOrThrow(id);
    await this.prisma.hr_solaf_emp_hesbat.delete({ where: { id } });
    return { id };
  }

  private async findDawabtOrThrow(id: number) {
    const row = await this.prisma.hr_solaf_dawabt.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الضابط غير موجود');
    return row;
  }

  private async findAccountOrThrow(id: number) {
    const row = await this.prisma.hr_solaf_emp_hesbat.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الحساب غير موجود');
    return row;
  }
}
