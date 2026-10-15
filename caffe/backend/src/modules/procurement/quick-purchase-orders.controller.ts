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
  list(@Query() query: ListQuickPurchaseOrdersDto) {
    return this.service.list(query);
  }

  @Get('statistics')
  statistics(@Query() query: QuickPurchaseOrderStatisticsDto) {
    return this.service.statistics(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertQuickPurchaseOrderDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertQuickPurchaseOrderDto>,
  ) {
    return this.service.update(id, body);
  }

  @Patch(':id/status')
  @RequiresPermission('gym-sales.procurement:approve')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeQuickPurchaseOrderStatusDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.changeStatus(id, body, userId);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
