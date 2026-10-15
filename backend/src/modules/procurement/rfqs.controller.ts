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
import {
  ImportRequisitionDto,
  ListRfqsDto,
  RfqItemDto,
  UpsertRfqDto,
} from './dto/procurement-ext.dto';
import { RfqsService } from './rfqs.service';

@UseGuards(JwtAuthGuard)
@Controller('rfqs')
@RequiresPermission('gym-sales.procurement.cafe_purchases:view')
export class RfqsController {
  constructor(private readonly service: RfqsService) {}

  @Get()
  list(@Query() query: ListRfqsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement.cafe_purchases:create')
  create(@Body() body: UpsertRfqDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement.cafe_purchases:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertRfqDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement.cafe_purchases:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/items')
  @RequiresPermission('gym-sales.procurement.cafe_purchases:update')
  addItem(@Param('id', ParseIntPipe) id: number, @Body() body: RfqItemDto) {
    return this.service.addItem(id, body);
  }

  @Post(':id/import-requisition')
  @RequiresPermission('gym-sales.procurement.cafe_purchases:update')
  importRequisition(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ImportRequisitionDto,
  ) {
    return this.service.importRequisition(id, body);
  }
}
