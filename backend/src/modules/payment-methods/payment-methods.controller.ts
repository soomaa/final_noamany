import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaymentMethodsService } from './payment-methods.service';
import type { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './payment-methods.service';

@UseGuards(JwtAuthGuard)
@Controller('payment-methods')
@RequiresPermission('accounting.payment_methods:view')
export class PaymentMethodsController {
  constructor(private readonly svc: PaymentMethodsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  @RequiresPermission('accounting.payment_methods:create')
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('accounting.payment_methods:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaymentMethodDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('accounting.payment_methods:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
