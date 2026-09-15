import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

export interface BranchView {
  id: number;
  name: string | null;
  parentId: number;
  lat: string | null;
  lng: string | null;
}

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** tbl_branches is canonical; geofence coords live in branch_settings (matched by title). */
  async findAll(): Promise<BranchView[]> {
    const [branches, settings] = await Promise.all([
      this.prisma.tbl_branches.findMany({ orderBy: { branch_id: 'asc' } }),
      this.prisma.branch_settings.findMany(),
    ]);
    const geoByTitle = new Map(settings.map((s) => [s.title, s]));
    return branches.map((b) => {
      const geo = b.branch_name ? geoByTitle.get(b.branch_name) : undefined;
      return {
        id: b.branch_id,
        name: b.branch_name,
        parentId: b.from_id,
        lat: geo?.lat_map ?? null,
        lng: geo?.long_map ?? null,
      };
    });
  }

  async create(dto: CreateBranchDto): Promise<BranchView> {
    const branch = await this.prisma.tbl_branches.create({
      data: { branch_name: dto.name, from_id: dto.parentId ?? 0 },
    });
    await this.syncGeo(dto.name, dto.parentId ?? 0, dto.lat, dto.lng);
    return { id: branch.branch_id, name: branch.branch_name, parentId: branch.from_id, lat: dto.lat ?? null, lng: dto.lng ?? null };
  }

  async update(id: number, dto: UpdateBranchDto): Promise<BranchView> {
    const existing = await this.prisma.tbl_branches.findUnique({ where: { branch_id: id } });
    if (!existing) throw new NotFoundException('الفرع غير موجود');
    const branch = await this.prisma.tbl_branches.update({
      where: { branch_id: id },
      data: { branch_name: dto.name, from_id: dto.parentId ?? existing.from_id },
    });
    await this.syncGeo(dto.name, branch.from_id, dto.lat, dto.lng);
    return { id: branch.branch_id, name: branch.branch_name, parentId: branch.from_id, lat: dto.lat ?? null, lng: dto.lng ?? null };
  }

  async remove(id: number): Promise<{ id: number }> {
    const existing = await this.prisma.tbl_branches.findUnique({ where: { branch_id: id } });
    if (!existing) throw new NotFoundException('الفرع غير موجود');
    await this.prisma.tbl_branches.delete({ where: { branch_id: id } });
    return { id };
  }

  private async syncGeo(title: string, fromId: number, lat?: string, lng?: string) {
    if (lat == null && lng == null) return;
    const row = await this.prisma.branch_settings.findFirst({ where: { title } });
    if (row) {
      await this.prisma.branch_settings.update({
        where: { id: row.id },
        data: { lat_map: lat ?? row.lat_map, long_map: lng ?? row.long_map },
      });
    } else {
      await this.prisma.branch_settings.create({
        data: { title, from_id: fromId, lat_map: lat ?? null, long_map: lng ?? null },
      });
    }
  }
}
