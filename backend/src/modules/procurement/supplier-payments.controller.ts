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
import { ListSupplierPaymentsDto, SettleSupplierDebtDto, UpsertSupplierPaymentDto } from './dto/procurement-ext.dto';
import type { JwtUser } from '../../common/types/jwt-user';
import { SupplierPaymentsService } from './supplier-payments.service';

@UseGuards(JwtAuthGuard)
@Controller('supplier-payments')
@RequiresPermission('gym-sales.procurement.supplier_payments:view')
export class SupplierPaymentsController {
  constructor(private readonly service: SupplierPaymentsService) {}

  @Get()
  list(@Query() query: ListSupplierPaymentsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statement/suppliers')
  @RequiresPermission('gym-sales.procurement.supplier_statement:view', 'gym-sales.procurement.supplier_payments:view')
  statementSuppliers() {
    return this.service.statementSuppliers();
  }

  @Get('statement')
  @RequiresPermission('gym-sales.procurement.supplier_statement:view', 'gym-sales.procurement.supplier_payments:view')
  statement(
    @Query('supplierId', ParseIntPipe) supplierId: number,
    @Query('branchId', new ParseIntPipe({ optional: true })) branchId: number | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.supplierStatement({ supplierId, branchId, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement.supplier_payments:create')
  create(@Body() body: UpsertSupplierPaymentDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.sub, user);
  }

  @Post('settle')
  @RequiresPermission('gym-sales.procurement.supplier_payments:create')
  settle(@Body() body: SettleSupplierDebtDto, @CurrentUser() user: JwtUser) {
    return this.service.settleDebt(body, user.sub, user);
  }

  @Post('refund')
  @RequiresPermission('gym-sales.procurement.supplier_payments:create')
  receiveRefund(@Body() body: SettleSupplierDebtDto, @CurrentUser() user: JwtUser) {
    return this.service.receiveRefund(body,user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement.supplier_payments:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertSupplierPaymentDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement.supplier_payments:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
