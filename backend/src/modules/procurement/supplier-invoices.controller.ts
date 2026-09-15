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
import { ListSupplierInvoicesDto, UpsertSupplierInvoiceDto } from './dto/procurement-ext.dto';
import { SupplierInvoicesService } from './supplier-invoices.service';

@UseGuards(JwtAuthGuard)
@Controller('supplier-invoices')
@RequiresPermission('gym-sales.procurement.cafe_purchases:view')
export class SupplierInvoicesController {
  constructor(private readonly service: SupplierInvoicesService) {}

  @Get()
  list(@Query() query: ListSupplierInvoicesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement.cafe_purchases:create')
  create(@Body() body: UpsertSupplierInvoiceDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement.cafe_purchases:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertSupplierInvoiceDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement.cafe_purchases:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
