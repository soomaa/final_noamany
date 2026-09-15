import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LOOKUPS, LookupDef } from './lookups.registry';

export interface LookupItem {
  id: number;
  title: string;
  /** sort order (where the underlying catalog supports it) */
  order?: number;
  /** parent id for parented catalogs (hai → city) */
  parentId?: number;
}

@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  private def(key: string): LookupDef {
    const d = LOOKUPS[key];
    if (!d) throw new NotFoundException(`قائمة غير معروفة: ${key}`);
    return d;
  }

  catalog() {
    return Object.entries(LOOKUPS).map(([key, d]) => ({ key, label: d.label, parented: !!d.parented }));
  }

  /**
   * List a catalog. For the `hai` source an optional `parent` (city id) filters
   * to one city's districts — legacy `get_hai/{city}`.
   */
  async list(key: string, parent?: number): Promise<LookupItem[]> {
    const d = this.def(key);
    if (d.source === 'employees_settings') {
      const rows = await this.prisma.employees_settings.findMany({
        where: {
          type: d.type,
          ...(d.typeName ? { type_name: d.typeName } : {}),
        },
        orderBy: { in_order: 'asc' },
      });
      return rows.map((r) => ({ id: r.id_setting, title: r.title_setting, order: r.in_order ?? 0 }));
    }
    if (d.source === 'all_defined_setting') {
      const rows = await this.prisma.all_defined_setting.findMany({
        where: {
          defined_type: d.definedType,
          ...(d.typeName ? { defined_type_title: d.typeName } : {}),
        },
        orderBy: { in_order: 'asc' },
      });
      return rows.map((r) => ({ id: r.defined_id, title: r.defined_title, order: this.parseOrder(r.in_order) }));
    }
    if (d.source === 'cities') {
      // top-level cities only (from_id_fk = 0)
      const rows = await this.prisma.cities.findMany({ where: { from_id_fk: 0 } });
      return this.sortCities(rows);
    }
    if (d.source === 'hai') {
      // districts: any row parented to a city. Optionally filter by parent city.
      const where = parent !== undefined ? { from_id_fk: parent } : { from_id_fk: { not: 0 } };
      const rows = await this.prisma.cities.findMany({ where });
      return this.sortCities(rows);
    }
    const banks = await this.prisma.banks.findMany({ orderBy: { bank_name: 'asc' } });
    return banks.map((b) => ({ id: b.id, title: b.bank_name }));
  }

  async create(key: string, title: string, opts: { order?: number; parentId?: number } = {}): Promise<LookupItem> {
    if (!title?.trim()) throw new BadRequestException('الاسم مطلوب');
    const d = this.def(key);
    if (d.source === 'employees_settings') {
      const row = await this.prisma.employees_settings.create({
        data: {
          title_setting: title,
          type: d.type!,
          type_name: d.typeName ?? '',
          have_branch: 0,
          form_id: 0,
          in_order: opts.order ?? 0,
        },
      });
      return { id: row.id_setting, title: row.title_setting, order: row.in_order ?? 0 };
    }
    if (d.source === 'all_defined_setting') {
      const row = await this.prisma.all_defined_setting.create({
        data: {
          defined_title: title,
          defined_type: d.definedType!,
          defined_type_title: d.typeName ?? '',
          in_order: String(opts.order ?? 0),
        },
      });
      return { id: row.defined_id, title: row.defined_title, order: this.parseOrder(row.in_order) };
    }
    if (d.source === 'cities' || d.source === 'hai') {
      const parentId = d.source === 'hai' ? opts.parentId : 0;
      if (d.source === 'hai' && !parentId) throw new BadRequestException('المدينة حقل ضرورى');
      const row = await this.prisma.cities.create({
        data: { name: title, from_id_fk: parentId ?? 0, in_order: String(opts.order ?? 0) },
      });
      return { id: row.id, title: row.name, order: this.parseOrder(row.in_order), parentId: row.from_id_fk };
    }
    const row = await this.prisma.banks.create({ data: { bank_name: title } });
    return { id: row.id, title: row.bank_name };
  }

  async update(key: string, id: number, title: string, opts: { order?: number; parentId?: number } = {}): Promise<LookupItem> {
    if (!title?.trim()) throw new BadRequestException('الاسم مطلوب');
    const d = this.def(key);
    if (d.source === 'employees_settings') {
      const row = await this.prisma.employees_settings.update({
        where: { id_setting: id },
        data: { title_setting: title, ...(opts.order !== undefined ? { in_order: opts.order } : {}) },
      });
      return { id: row.id_setting, title: row.title_setting, order: row.in_order ?? 0 };
    }
    if (d.source === 'all_defined_setting') {
      const row = await this.prisma.all_defined_setting.update({
        where: { defined_id: id },
        data: { defined_title: title, ...(opts.order !== undefined ? { in_order: String(opts.order) } : {}) },
      });
      return { id: row.defined_id, title: row.defined_title, order: this.parseOrder(row.in_order) };
    }
    if (d.source === 'cities' || d.source === 'hai') {
      const data: Record<string, unknown> = { name: title };
      if (opts.order !== undefined) data.in_order = String(opts.order);
      if (d.source === 'hai' && opts.parentId !== undefined) data.from_id_fk = opts.parentId;
      const row = await this.prisma.cities.update({ where: { id }, data });
      return { id: row.id, title: row.name, order: this.parseOrder(row.in_order), parentId: row.from_id_fk };
    }
    const row = await this.prisma.banks.update({ where: { id }, data: { bank_name: title } });
    return { id: row.id, title: row.bank_name };
  }

  async remove(key: string, id: number): Promise<{ id: number }> {
    const d = this.def(key);
    if (d.source === 'employees_settings') await this.prisma.employees_settings.delete({ where: { id_setting: id } });
    else if (d.source === 'all_defined_setting') await this.prisma.all_defined_setting.delete({ where: { defined_id: id } });
    else if (d.source === 'cities' || d.source === 'hai') await this.prisma.cities.delete({ where: { id } });
    else await this.prisma.banks.delete({ where: { id } });
    return { id };
  }

  private parseOrder(v: string | null | undefined): number {
    const n = parseInt(v ?? '0', 10);
    return Number.isNaN(n) ? 0 : n;
  }

  private sortCities(rows: { id: number; name: string; in_order: string; from_id_fk: number }[]): LookupItem[] {
    return rows
      .map((r) => ({ id: r.id, title: r.name, order: this.parseOrder(r.in_order), parentId: r.from_id_fk }))
      .sort((a, b) => a.order - b.order || a.id - b.id);
  }
}
