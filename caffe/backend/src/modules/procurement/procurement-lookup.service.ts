import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProcurementLookupDto } from './dto/procurement-ext.dto';
import { notDeletedFilter, toNumber } from './procurement.utils';

@Injectable()
export class ProcurementLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: ProcurementLookupDto) {
    const term = q.q?.trim() ?? '';
    const and: Prisma.inv_productsWhereInput[] = [
      notDeletedFilter(),
      { status: 'active' },
    ];

    if (term) {
      and.push({
        OR: [
          { name_ar: { contains: term } },
          { name_en: { contains: term } },
          { product_code: { contains: term } },
          { barcode: { contains: term } },
        ],
      });
    }

    if (q.type === 'spares') {
      and.push({
        OR: [
          { product_code: { contains: 'SPR' } },
          { name_ar: { contains: 'قطع' } },
        ],
      });
    } else if (q.type === 'equipment') {
      and.push({
        OR: [
          { product_code: { contains: 'EQ' } },
          { name_ar: { contains: 'معدات' } },
        ],
      });
    } else if (q.type === 'services') {
      and.push({
        OR: [
          { product_code: { contains: 'SRV' } },
          { name_ar: { contains: 'خدم' } },
        ],
      });
    } else if (q.type === 'materials') {
      and.push({
        OR: [
          { product_code: { contains: 'MAT' } },
          { name_ar: { contains: 'مواد' } },
        ],
      });
    }

    const rows = await this.prisma.inv_products.findMany({
      where: { AND: and },
      take: 20,
      orderBy: { name_ar: 'asc' },
      select: {
        id: true,
        product_code: true,
        name_ar: true,
        name_en: true,
        unit_of_measure: true,
        cost_price: true,
        selling_price: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      code: r.product_code,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      unit: r.unit_of_measure,
      costPrice: toNumber(r.cost_price),
      sellingPrice: toNumber(r.selling_price),
      type: q.type,
    }));
  }
}
