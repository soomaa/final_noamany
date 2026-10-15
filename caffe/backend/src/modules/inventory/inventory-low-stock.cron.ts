import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toNumber } from './inventory.utils';

/** Daily scan for products at/below reorder point — surfaces in lowStock API / dashboard. */
@Injectable()
export class InventoryLowStockCron {
  private readonly logger = new Logger(InventoryLowStockCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 7 * * *', { timeZone: 'Africa/Cairo' })
  async scanLowStock() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:inventory-low-stock', 0, () =>
      this.scanLowStockLocked(),
    );
    if (ran === null) this.logger.debug('Skipped low-stock scan; another instance holds the lock');
  }

  private async scanLowStockLocked() {
    const products = await this.prisma.inv_products.findMany({
      where: {
        is_deleted: false,
        status: 'active',
        inventory_kind: { not: 'manufactured_internal' },
      },
      select: {
        id: true,
        name_ar: true,
        reorder_point: true,
        balances: { select: { current_stock: true } },
      },
    });
    const low = products.filter((product) => {
      const currentStock = product.balances.reduce(
        (sum, balance) => sum + toNumber(balance.current_stock),
        0,
      );
      return currentStock <= toNumber(product.reorder_point);
    });
    if (low.length > 0) {
      this.logger.warn(`Low stock alert: ${low.length} item(s) at/below reorder point`);
    }
  }
}
