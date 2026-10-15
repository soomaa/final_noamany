import { MonthlyPayrollEventDto, PayrollCafeChoiceDto } from '../payroll/dto/payroll.dto';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { CreatePayrollRunDto, ListPayrollRunsDto } from '../payroll/dto/payroll.dto';
import { FinancePayrollService } from './finance-payroll.service';

@UseGuards(JwtAuthGuard)
@Controller('finance/payroll')
@RequiresPermission('financial-reports.payroll:view', 'financial-reports.payroll_approval:view')
export class FinancePayrollController {
  constructor(private readonly service: FinancePayrollService) {}

  @Get()
  @ScopedHrData()
  list(@Query() query: ListPayrollRunsDto, @CurrentUser() user: JwtUser) {
    return this.service.listRuns(query, user);
  }

  @Get(':id')
  @ScopedHrData()
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.getRun(id, user);
  }

  @Get(':id/lines')
  @ScopedHrData()
  lines(@Param('id', ParseIntPipe) id: number, @Query() query: PaginationDto, @CurrentUser() user: JwtUser) {
    return this.service.listRunLines(id, query, user);
  }

  @Get(':id/items/:itemId')
  @ScopedHrData()
  slip(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @CurrentUser() user: JwtUser) {
    return this.service.getSlip(id, itemId, user);
  }

  @Get(':id/items/:itemId/monthly')
  @ScopedHrData()
  monthly(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @CurrentUser() user: JwtUser) {
    return this.service.monthlyEmployee(id, itemId, user);
  }

  @Post(':id/items/:itemId/events')
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll:update')
  event(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Body() dto: MonthlyPayrollEventDto, @CurrentUser() user: JwtUser) {
    return this.service.addMonthlyEvent(id, itemId, dto, user);
  }

  @Post(':id/items/:itemId/cafe')
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll:update')
  cafe(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Body() dto: PayrollCafeChoiceDto, @CurrentUser() user: JwtUser) {
    return this.service.chooseMonthlyCafe(id, itemId, dto, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll:update')
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: JwtUser) {
    return this.service.createRun(dto, user);
  }

  @Post(':id/compute')
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll:update')
  compute(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.runAction(id, 'compute', user);
  }

  @Post(':id/submit')
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll:update')
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.runAction(id, 'review', user);
  }

  @Post(':id/approve')
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll_approval:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.runAction(id, 'approve', user);
  }

  @Post(':id/post')
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll_approval:approve')
  post(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.runAction(id, 'post', user);
  }

  @Post(':id/bank')
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll_approval:approve')
  bank(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.runAction(id, 'bank', user);
  }

  @Post(':id/bank-sync')
  @ScopedHrData()
  @RequiresPermission('financial-reports.payroll_approval:approve')
  bankSync(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.runAction(id, 'bank-sync', user);
  }
}
