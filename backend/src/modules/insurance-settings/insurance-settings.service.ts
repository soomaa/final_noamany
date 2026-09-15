import { Injectable, NotFoundException } from '@nestjs/common';
import { withDryRun } from '../../common/preview/dry-run.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BulkReplaceInsuranceDto } from './dto/insurance-settings.dto';

@Injectable()
export class InsuranceSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll() {
    const [saudiRows, nonSaudiRows, catalog] = await Promise.all([
      this.loadByNationality(0),
      this.loadByNationality(1),
      this.loadCatalog(),
    ]);

    return {
      saudi: saudiRows,
      nonSaudi: nonSaudiRows,
      catalog,
    };
  }

  async replaceByNationality(dto: BulkReplaceInsuranceDto, dryRun = false) {
    if (dto.nationalityType !== 0 && dto.nationalityType !== 1) {
      throw new NotFoundException('نوع الجنسية غير صالح');
    }

    const catalog = await this.loadCatalog();
    const byId = new Map(dto.items.map((i) => [i.settingId, i]));
    const existing = await this.prisma.hr_insurance_settings.findMany({
      where: { nationality_type: dto.nationalityType },
    });

    const buildPreview = () => ({
      nationalityType: dto.nationalityType,
      deleted: existing.length,
      created: catalog.length,
      rows: catalog.map((c) => {
        const item = byId.get(c.id);
        return {
          settingId: c.id,
          title: c.title,
          empAverage: item?.empAverage ?? '0',
          societyAverage: item?.societyAverage ?? '0',
        };
      }),
      warning: 'سيتم حذف جميع نسب التأمين الحالية لهذه الجنسية ثم إعادة إدراجها',
    });

    return withDryRun(dryRun, buildPreview, async () => {
      // Legacy Hr_insurance_settings_model::update — full delete then re-insert one
      // row per coverage component (employees_settings type=19) for this nationality.
      await this.prisma.hr_insurance_settings.deleteMany({
        where: { nationality_type: dto.nationalityType },
      });

      const now = Math.floor(Date.now() / 1000);
      const midnight = Math.floor(new Date(new Date().toDateString()).getTime() / 1000);

      let count = 0;
      for (const c of catalog) {
        const item = byId.get(c.id);
        await this.prisma.hr_insurance_settings.create({
          data: {
            nationality_type: dto.nationalityType,
            setting_id_fk: String(c.id),
            emp_average: item?.empAverage ?? '0',
            society_average: item?.societyAverage ?? '0',
            date: String(midnight),
            date_s: String(now),
          },
        });
        count++;
      }

      return { nationalityType: dto.nationalityType, count };
    });
  }

  /**
   * Flat rate lookup for consumers (the payroll/GOSI engine).
   * Returns every (nationality_type, setting_id_fk) rate pair so the engine can
   * apply emp_average / society_average against the insurable base.
   */
  async getRates() {
    const rows = await this.prisma.hr_insurance_settings.findMany({ orderBy: { id: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      nationalityType: r.nationality_type,
      settingId: r.setting_id_fk ? parseInt(r.setting_id_fk, 10) : null,
      empAverage: r.emp_average,
      societyAverage: r.society_average,
    }));
  }

  /** Single rate for a (nationality, coverage-component) pair, or null. */
  async getRate(nationalityType: number, settingId: number) {
    const row = await this.prisma.hr_insurance_settings.findFirst({
      where: { nationality_type: nationalityType, setting_id_fk: String(settingId) },
    });
    if (!row) return null;
    return {
      empAverage: row.emp_average,
      societyAverage: row.society_average,
    };
  }

  async removeByNationality(nationalityType: number) {
    await this.prisma.hr_insurance_settings.deleteMany({ where: { nationality_type: nationalityType } });
    return { nationalityType };
  }

  private async loadByNationality(nationalityType: number) {
    const rows = await this.prisma.hr_insurance_settings.findMany({
      where: { nationality_type: nationalityType },
      orderBy: { id: 'asc' },
    });

    const catalog = await this.loadCatalog();
    const catalogMap = new Map(catalog.map((c) => [c.id, c.title]));

    return rows.map((r) => ({
      id: r.id,
      settingId: r.setting_id_fk ? parseInt(r.setting_id_fk, 10) : null,
      settingTitle: r.setting_id_fk ? catalogMap.get(parseInt(r.setting_id_fk, 10)) : null,
      empAverage: r.emp_average,
      societyAverage: r.society_average,
      nationalityType: r.nationality_type,
    }));
  }

  private async loadCatalog() {
    const rows = await this.prisma.employees_settings.findMany({
      where: { type: 19 },
      orderBy: { in_order: 'asc' },
    });
    return rows.map((r) => ({ id: r.id_setting, title: r.title_setting }));
  }
}
