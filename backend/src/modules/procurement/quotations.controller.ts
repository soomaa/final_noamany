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
import { ListQuotationsDto, UpsertQuotationDto } from './dto/procurement-ext.dto';
import { QuotationsService } from './quotations.service';

@UseGuards(JwtAuthGuard)
@Controller('quotations')
@RequiresPermission('gym-sales.procurement:view')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}

  @Get()
  list(@Query() query: ListQuotationsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertQuotationDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertQuotationDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/accept')
  @RequiresPermission('gym-sales.procurement:approve')
  accept(@Param('id', ParseIntPipe) id: number) {
    return this.service.accept(id);
  }
}
