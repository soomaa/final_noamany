import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { PosStockWatchService } from './pos-stock-watch.service';

/** Read-only stock strip shown on the POS (see PosStockWatchService). */
@UseGuards(JwtAuthGuard)
@Controller('pos/stock-watch')
export class PosStockWatchController {
  constructor(private readonly service: PosStockWatchService) {}

  @Get()
  @RequiresPermission('gym-sales.sales.new_receipt:view')
  watch(@Query('branchId') branchId: string, @CurrentUser() user: JwtUser) {
    const id = Number(branchId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('الفرع مطلوب');
    return this.service.watch(id, user);
  }
}
