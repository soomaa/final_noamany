import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListPurchaseOrdersDto, UpsertPurchaseOrderDto } from './dto/procurement-ext.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@UseGuards(JwtAuthGuard)
@Controller('purchase-orders')
@RequiresPermission('gym-sales.procurement:view')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  list(@Query() query: ListPurchaseOrdersDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertPurchaseOrderDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertPurchaseOrderDto>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
