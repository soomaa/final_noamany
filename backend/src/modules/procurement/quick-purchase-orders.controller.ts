import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import {
  ChangeQuickPurchaseOrderStatusDto,
  ListQuickPurchaseOrdersDto,
  QuickPurchaseOrderStatisticsDto,
  UpsertQuickPurchaseOrderDto,
} from './dto/procurement.dto';
import { QuickPurchaseOrdersService } from './quick-purchase-orders.service';

@UseGuards(JwtAuthGuard)
@Controller('quick-purchase-orders')
@RequiresPermission('gym-sales.procurement:view')
export class QuickPurchaseOrdersController {
  constructor(private readonly service: QuickPurchaseOrdersService) {}

  @Get()
  list(@Query() query: ListQuickPurchaseOrdersDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@Query() query: QuickPurchaseOrderStatisticsDto, @CurrentUser() user: JwtUser) {
    return this.service.statistics(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertQuickPurchaseOrderDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertQuickPurchaseOrderDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Patch(':id/status')
  @RequiresPermission('gym-sales.procurement:approve')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeQuickPurchaseOrderStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.changeStatus(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
