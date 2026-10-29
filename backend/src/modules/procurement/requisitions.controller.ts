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
  list(@Query() query: ListRequisitionsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertRequisitionDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertRequisitionDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/items')
  @RequiresPermission('gym-sales.procurement:update')
  addItem(@Param('id', ParseIntPipe) id: number, @Body() body: RequisitionItemDto, @CurrentUser() user: JwtUser) {
    return this.service.addItem(id, body, user);
  }

  @Post(':id/submit')
  @RequiresPermission('gym-sales.procurement:update')
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.submit(id, user);
  }
}
