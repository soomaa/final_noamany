import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ListLoansDto } from './dto/list-loans.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { isDryRun } from '../../common/preview/dry-run.util';
import { PostponeInstallmentDto } from './dto/postpone-installment.dto';
import { LoansService } from './loans.service';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';

@UseGuards(JwtAuthGuard)
@Controller('loans')
@RequiresPermission('finance.loans:view')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get()
  @ScopedHrData()
  list(@Query() query: ListLoansDto, @CurrentUser() user: JwtUser) {
    return this.loans.list(query, user);
  }

  @Get('statement')
  @ScopedHrData()
  statement(@CurrentUser() user: JwtUser) {
    return this.loans.statement(user);
  }

  @Get('statement/grid')
  @ScopedHrData()
  statementGrid(@CurrentUser() user: JwtUser) {
    return this.loans.statementGrid(user);
  }

  @Get('ceiling/:empId')
  @ScopedHrData()
  ceiling(@Param('empId', ParseIntPipe) empId: number, @CurrentUser() user: JwtUser) {
    return this.loans.ceiling(empId, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('finance.loans:create')
  create(@Body() dto: CreateLoanDto, @CurrentUser() user: JwtUser) {
    return this.loans.create(dto, user.sub, user);
  }

  @Get(':id/schedule')
  @ScopedHrData()
  schedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.loans.schedule(id, user);
  }

  @Patch(':id/approve')
  @ScopedHrData()
  @RequiresPermission('finance.loans:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.loans.approve(id, user.sub, user);
  }

  @Patch(':id/reject')
  @ScopedHrData()
  @RequiresPermission('finance.loans:reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.loans.reject(id, user);
  }

  @Patch('installments/:questId/pay')
  @ScopedHrData()
  @RequiresPermission('finance.loans:update')
  payInstallment(
    @Param('questId', ParseIntPipe) questId: number,
    @Body() dto: PayInstallmentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.loans.payInstallment(questId, dto, user.sub, user);
  }

  @Patch(':id/auto-deduct')
  @ScopedHrData()
  @RequiresPermission('finance.loans:update')
  autoDeduct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('month') month?: string,
  ) {
    return this.loans.autoDeduct(id, month ? Number(month) : undefined, user);
  }

  @Post(':id/postpone')
  @ScopedHrData()
  @RequiresPermission('finance.loans:update')
  postpone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PostponeInstallmentDto,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.loans.postponeInstallment(id, dto, user.sub, user.name, isDryRun(dryRun), user);
  }

  @Delete(':id')
  @ScopedHrData()
  @RequiresPermission('finance.loans:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.loans.remove(id, user);
  }
}
