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
import { JwtUser } from '../../common/types/jwt-user';
import { ListPurchaseInvoicesDto, UpsertPurchaseInvoiceDto } from './dto/procurement-ext.dto';
import { PurchaseInvoicesService } from './purchase-invoices.service';

@UseGuards(JwtAuthGuard)
@Controller('purchase-invoices')
@RequiresPermission('gym-sales.procurement:view')
export class PurchaseInvoicesController {
  constructor(private readonly service: PurchaseInvoicesService) {}

  @Get()
  list(@Query() query: ListPurchaseInvoicesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertPurchaseInvoiceDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertPurchaseInvoiceDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/match')
  @RequiresPermission('gym-sales.procurement:approve')
  match(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.match(id, user);
  }
}
