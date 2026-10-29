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
  list(@Query() query: ListSupplierPaymentSchedulesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertSupplierPaymentScheduleDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertSupplierPaymentScheduleDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
