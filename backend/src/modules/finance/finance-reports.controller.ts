import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RequiresPermission } from "../../common/decorators/requires-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtUser } from "../../common/types/jwt-user";
import {
  ExpenseReportsQueryDto,
  FinanceAnalysisQueryDto,
  FinanceDashboardQueryDto,
  ProfitLossQueryDto,
  RevenueReportsQueryDto,
} from "./dto/finance.dto";
import { FinanceReportsService } from "./finance-reports.service";

@UseGuards(JwtAuthGuard)
@Controller("finance")
export class FinanceReportsController {
  constructor(private readonly service: FinanceReportsService) {}

  @Get("disbursement-orders")
  @RequiresPermission("financial-reports.reports:view")
  disbursementOrders(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.disbursementOrders(page, limit);
  }

  @Get("disbursement-orders/:id")
  @RequiresPermission("financial-reports.reports:view")
  disbursementOrder(@Param("id", ParseIntPipe) id: number) {
    return this.service.disbursementOrder(id);
  }

  @Get("dashboard")
  @RequiresPermission("financial-reports.dashboard:view")
  dashboard(
    @Query() query: FinanceDashboardQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.dashboard(query, user);
  }

  @Get("expense-reports")
  @RequiresPermission("financial-reports.reports:view")
  expenseReports(
    @Query() query: ExpenseReportsQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.expenseReports(query, user);
  }

  @Get("revenue-reports")
  @RequiresPermission(
    "financial-reports.revenue_reports:view",
    "financial-reports.reports:view",
  )
  revenueReports(
    @Query() query: RevenueReportsQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.revenueReports(query, user);
  }

  @Get("analysis")
  @RequiresPermission(
    "financial-reports.analysis:view",
    "financial-reports.reports:view",
  )
  analysis(
    @Query() query: FinanceAnalysisQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.analysis(query, user);
  }

  @Get("profit-loss")
  @RequiresPermission(
    "financial-reports.profit_loss:view",
    "financial-reports.reports:view",
  )
  profitLoss(@Query() query: ProfitLossQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.profitLoss(query, user);
  }
}
