import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { InventoryAuditService } from './inventory-audit.service';

/** "سجل ومشاكل المخزون": live stock-health issues + inventory change timeline. Read-only. */
@UseGuards(JwtAuthGuard)
@Controller('inventory-audit')
@RequiresPermission('gym-sales.inventory.audit_log:view')
export class InventoryAuditController {
  constructor(private readonly service: InventoryAuditService) {}

  @Get()
  summary(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
    return this.service.summary({ dateFrom: valid(dateFrom), dateTo: valid(dateTo) });
  }
}
