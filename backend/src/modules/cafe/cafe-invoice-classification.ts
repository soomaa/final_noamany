import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { cafeProductHasAnyCategory } from './cafe-product-categories';
import { CafeInvoiceClassificationDto } from './dto/cafe-invoice-classification.dto';

type InvoiceProduct = {
  name?: string;
  name_ar?: string;
  category_id: number | null;
  category_assignments?: Array<{ category_id: number }>;
};

export async function assertCafeInvoiceClassification(
  db: PrismaService | Prisma.TransactionClient,
  classification: CafeInvoiceClassificationDto,
) {
  if (!['male', 'female'].includes(classification.gender)) {
    throw new BadRequestException('اختر جنس العميل');
  }
  if (!Number.isInteger(classification.cafeCategoryId) || classification.cafeCategoryId <= 0) {
    throw new BadRequestException('اختر فئة الفاتورة');
  }
  const category = await db.inv_categories.findFirst({
    where: { id: classification.cafeCategoryId, is_active: true, is_deleted: false },
    select: { id: true },
  });
  if (!category) throw new BadRequestException('فئة فاتورة الكافيه المختارة غير متاحة');
}

export function assertCafeInvoiceProducts(categoryId: number, products: InvoiceProduct[]) {
  const mismatch = products.find(product => !cafeProductHasAnyCategory(product, [categoryId]));
  if (mismatch) {
    throw new BadRequestException(`المنتج ${mismatch.name ?? mismatch.name_ar ?? ''} لا ينتمي إلى فئة الفاتورة المختارة`);
  }
}
