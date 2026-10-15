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
  ListRequisitionsDto,
  RequisitionItemDto,
  UpsertRequisitionDto,
} from './dto/procurement-ext.dto';
import { RequisitionsService } from './requisitions.service';

@UseGuards(JwtAuthGuard)
@Controller('requisitions')
@RequiresPermission('gym-sales.procurement:view')
export class RequisitionsController {
  constructor(private readonly service: RequisitionsService) {}

  @Get()
  list(@Query() query: ListRequisitionsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertRequisitionDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertRequisitionDto>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/items')
  @RequiresPermission('gym-sales.procurement:update')
  addItem(@Param('id', ParseIntPipe) id: number, @Body() body: RequisitionItemDto) {
    return this.service.addItem(id, body);
  }

  @Post(':id/submit')
  @RequiresPermission('gym-sales.procurement:update')
  submit(@Param('id', ParseIntPipe) id: number) {
    return this.service.submit(id);
  }
}
