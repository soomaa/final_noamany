import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateLocationDto,
  ListLocationsDto,
  LocationType,
  UpdateLocationDto,
} from './dto/locations.dto';

export interface LocationView {
  id: number;
  name: string | null;
  type: LocationType | null;
  parentId: number | null;
}

export interface LocationTreeNode extends LocationView {
  children: LocationTreeNode[];
}

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List rows of a given from_type, optionally filtered by parent (from_id).
   * Mirrors legacy locations/{Country,City,Region}.php listings.
   */
  async list(q: ListLocationsDto) {
    const and: Prisma.conf_country_settingWhereInput[] = [];
    if (q.type) and.push({ from_type: q.type });
    if (q.parent != null) and.push({ from_id: q.parent });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ name: { contains: s } });
    }

    const where: Prisma.conf_country_settingWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.conf_country_setting.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.conf_country_setting.count({ where }),
    ]);

    const data = rows.map((r) => this.toView(r));
    return paginated(data, total, q.page, q.pageSize);
  }

  /**
   * Nested directory: countries → cities → regions.
   * Built in memory from a single fetch (the table is small).
   */
  async tree(): Promise<LocationTreeNode[]> {
    const rows = await this.prisma.conf_country_setting.findMany({ orderBy: { name: 'asc' } });

    const countries: LocationTreeNode[] = [];
    const cities: LocationTreeNode[] = [];
    const regions: LocationTreeNode[] = [];

    for (const r of rows) {
      const node: LocationTreeNode = { ...this.toView(r), children: [] };
      if (r.from_type === 'country') countries.push(node);
      else if (r.from_type === 'city') cities.push(node);
      else if (r.from_type === 'region') regions.push(node);
    }

    const countryById = new Map(countries.map((c) => [c.id, c]));
    const cityById = new Map(cities.map((c) => [c.id, c]));

    for (const city of cities) {
      if (city.parentId != null) countryById.get(city.parentId)?.children.push(city);
    }
    for (const region of regions) {
      if (region.parentId != null) cityById.get(region.parentId)?.children.push(region);
    }

    return countries;
  }

  async create(dto: CreateLocationDto) {
    const parentId = await this.resolveParent(dto.type, dto.parentId);

    const row = await this.prisma.conf_country_setting.create({
      data: {
        name: dto.name.trim(),
        from_type: dto.type,
        from_id: parentId,
      },
    });
    return { id: row.main_id };
  }

  async update(id: number, dto: UpdateLocationDto) {
    await this.findOrThrow(id);
    await this.prisma.conf_country_setting.update({
      where: { main_id: id },
      data: { name: dto.name.trim(), updated: new Date() },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);

    // Block deletion while children (cities under a country, or regions under a city) exist.
    const children = await this.prisma.conf_country_setting.count({ where: { from_id: id } });
    if (children > 0) {
      throw new BadRequestException('لا يمكن الحذف لوجود عناصر مرتبطة');
    }

    await this.prisma.conf_country_setting.delete({ where: { main_id: id } });
    return { id };
  }

  /**
   * Validate the parent for a new node:
   *  - country: no parent (stored as null).
   *  - city: requires an existing country parent.
   *  - region: requires an existing city parent.
   */
  private async resolveParent(type: LocationType, parentId?: number): Promise<number | null> {
    if (type === 'country') return null;

    const requiredParentType: LocationType = type === 'city' ? 'country' : 'city';
    if (parentId == null) {
      throw new BadRequestException(
        type === 'city' ? 'يجب اختيار الدولة' : 'يجب اختيار المدينة',
      );
    }

    const parent = await this.prisma.conf_country_setting.findUnique({
      where: { main_id: parentId },
    });
    if (!parent || parent.from_type !== requiredParentType) {
      throw new BadRequestException(
        type === 'city' ? 'الدولة المحددة غير موجودة' : 'المدينة المحددة غير موجودة',
      );
    }
    return parentId;
  }

  private toView(r: {
    main_id: number;
    name: string | null;
    from_id: number | null;
    from_type: LocationType | null;
  }): LocationView {
    return { id: r.main_id, name: r.name, type: r.from_type, parentId: r.from_id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.conf_country_setting.findUnique({ where: { main_id: id } });
    if (!row) throw new NotFoundException('الموقع غير موجود');
    return row;
  }
}
