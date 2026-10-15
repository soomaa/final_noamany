import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListInventoryMovementsDto } from './dto/inventory.dto';
import { InventoryMovementsService } from './inventory-movements.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('inventory-movements')
@RequiresPermission('gym-sales.inventory.movement_log:view')
export class InventoryMovementsController {
  constructor(private readonly service: InventoryMovementsService) {}

  @Get()
  list(@Query() query: ListInventoryMovementsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('stats')
  stats(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.stats(branchId, user);
  }

  @Get('export')
  @RequiresPermission('gym-sales.inventory.movement_log:export')
  exportList(@Query() query: ListInventoryMovementsDto, @CurrentUser() user: JwtUser) {
    return this.service.exportList(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }
}
