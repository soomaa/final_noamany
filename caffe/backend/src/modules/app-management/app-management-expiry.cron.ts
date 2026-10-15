import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Daily job that deactivates offers/ads whose end_date has passed, so an expired
 * promotion can never keep showing as active in the mobile app (fixes the "is_active
 * stays true forever" gap). Dates are stored as YYYY-MM-DD strings → lexical compare is safe.
 */
@Injectable()
export class AppManagementExpiryCron {
  private readonly logger = new Logger(AppManagementExpiryCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('5 0 * * *', { timeZone: 'Africa/Cairo' })
  async expirePromotions() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:app-management-expiry', 0, () =>
      this.expirePromotionsLocked(),
    );
    if (ran === null) this.logger.debug('Skipped app-management expiry; another instance holds the lock');
  }

  private async expirePromotionsLocked() {
    const today = new Date().toISOString().slice(0, 10);
    const [offers, ads] = await Promise.all([
      this.prisma.am_offers.updateMany({
        where: { is_active: true, end_date: { not: null, lt: today } },
        data: { is_active: false },
      }),
      this.prisma.am_ads.updateMany({
        where: { is_active: true, end_date: { not: null, lt: today } },
        data: { is_active: false },
      }),
    ]);
    if (offers.count || ads.count) {
      this.logger.log(`Auto-expired ${offers.count} offer(s) and ${ads.count} ad(s) past their end date`);
    }
  }
}
