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
import {
  ListSupplierPaymentSchedulesDto,
  UpsertSupplierPaymentScheduleDto,
} from './dto/procurement-ext.dto';
import { SupplierPaymentSchedulesService } from './supplier-payment-schedules.service';

@UseGuards(JwtAuthGuard)
@Controller('supplier-payment-schedules')
@RequiresPermission('gym-sales.procurement:view')
export class SupplierPaymentSchedulesController {
  constructor(private readonly service: SupplierPaymentSchedulesService) {}

  @Get()
  list(@Query() query: ListSupplierPaymentSchedulesDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertSupplierPaymentScheduleDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertSupplierPaymentScheduleDto>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
