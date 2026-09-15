import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
  ExpenseStatisticsQueryDto,
  ListExpensesDto,
  RejectExpenseDto,
  UpsertExpenseDto,
} from './dto/finance.dto';
import { ExpensesService } from './expenses.service';

@UseGuards(JwtAuthGuard)
@Controller('expenses')
@RequiresPermission(
  'financial-reports.expenses:view',
  'club.subscriptions.treasury:view',
)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  list(@Query() query: ListExpensesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@Query() query: ExpenseStatisticsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.statistics(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission(
    'financial-reports.expenses:create',
    'club.subscriptions.treasury:create',
  )
  create(@Body() body: UpsertExpenseDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.sub, user);
  }

  @Put(':id')
  @RequiresPermission('financial-reports.expenses:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertExpenseDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('financial-reports.expenses:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Patch(':id/approve')
  @RequiresPermission('financial-reports.expenses:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.approve(id, user.sub, user);
  }

  @Patch(':id/reject')
  @RequiresPermission('financial-reports.expenses:reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectExpenseDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reject(id, body, user.sub, user);
  }
}
