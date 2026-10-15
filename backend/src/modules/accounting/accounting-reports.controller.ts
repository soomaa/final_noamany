import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { AccountingReportsService } from './accounting-reports.service';
import {
  AccountStatementQueryDto,
  BalanceSheetQueryDto,
  GeneralLedgerQueryDto,
  ReportDateRangeDto,
} from './dto/accounting.dto';

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingReportsController {
  constructor(private readonly service: AccountingReportsService) {}

  @Get('dashboard')
  @RequiresPermission('accounting.dashboard:view')
  dashboard(@Query() query: ReportDateRangeDto, @CurrentUser() user: JwtUser) {
    return this.service.dashboard(query, user);
  }

  @Get('trial-balance')
  @RequiresPermission('accounting.reports:view')
  trialBalance(@Query() query: ReportDateRangeDto, @CurrentUser() user: JwtUser) {
    return this.service.trialBalance(query, user);
  }

  @Get('account-statement')
  @RequiresPermission('accounting.reports.statement:view')
  accountStatement(@Query() query: AccountStatementQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.accountStatement(query, user);
  }

  @Get('general-ledger')
  @RequiresPermission('accounting.reports.gl:view')
  generalLedger(@Query() query: GeneralLedgerQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.generalLedger(query, user);
  }

  @Get('income-statement')
  @RequiresPermission('accounting.reports.income:view')
  incomeStatement(@Query() query: ReportDateRangeDto, @CurrentUser() user: JwtUser) {
    return this.service.incomeStatement(query, user);
  }

  @Get('balance-sheet')
  @RequiresPermission('accounting.reports.balance:view')
  balanceSheet(@Query() query: BalanceSheetQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.balanceSheet(query, user);
  }

  @Get('cash-flow')
  @RequiresPermission('accounting.reports.cashflow:view')
  cashFlow(@Query() query: ReportDateRangeDto, @CurrentUser() user: JwtUser) {
    return this.service.cashFlow(query, user);
  }
}
