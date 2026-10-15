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
  ListRevenuesDto,
  RevenueStatisticsQueryDto,
  SyncRevenuesDto,
  TopCustomersQueryDto,
  UpsertRevenueDto,
} from './dto/finance.dto';
import { RevenuesService } from './revenues.service';

@UseGuards(JwtAuthGuard)
@Controller('revenues')
@RequiresPermission('financial-reports.revenues:view')
export class RevenuesController {
  constructor(private readonly service: RevenuesService) {}

  @Get()
  list(@Query() query: ListRevenuesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@Query() query: RevenueStatisticsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.statistics(query, user);
  }

  @Get('top-customers')
  topCustomers(@Query() query: TopCustomersQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.topCustomers(query, user);
  }

  @Post('sync')
  @RequiresPermission('financial-reports.revenues:create')
  sync(@Body() body: SyncRevenuesDto, @CurrentUser() user: JwtUser) {
    return this.service.sync(body, user.sub, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('financial-reports.revenues:create')
  create(@Body() body: UpsertRevenueDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.sub, user);
  }

  @Put(':id')
  @RequiresPermission('financial-reports.revenues:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertRevenueDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user.sub, user);
  }

  @Delete(':id')
  @RequiresPermission('financial-reports.revenues:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.sub, user);
  }
}
