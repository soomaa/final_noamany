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
import { ListPurchaseInvoicesDto, UpsertPurchaseInvoiceDto } from './dto/procurement-ext.dto';
import { PurchaseInvoicesService } from './purchase-invoices.service';

@UseGuards(JwtAuthGuard)
@Controller('purchase-invoices')
@RequiresPermission('gym-sales.procurement:view')
export class PurchaseInvoicesController {
  constructor(private readonly service: PurchaseInvoicesService) {}

  @Get()
  list(@Query() query: ListPurchaseInvoicesDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertPurchaseInvoiceDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertPurchaseInvoiceDto>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/match')
  @RequiresPermission('gym-sales.procurement:approve')
  match(@Param('id', ParseIntPipe) id: number) {
    return this.service.match(id);
  }
}
