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
import { ClubSubscriptionsService } from './club-subscriptions.service';
import {
  ProcessClubPaymentDto,
  QuoteClubSubscriptionRenewalDto,
  RenewClubSubscriptionDto,
} from './dto/club-subscription-payment.dto';
import { ClubSubscriptionRenewalService } from './club-subscription-renewal.service';
import { ListClubSubscriptionsDto } from './dto/list-club-subscriptions.dto';
import { UpsertClubSubscriptionDto } from './dto/upsert-club-subscription.dto';
import {
  DailyCloseInput,
  DailyCloseQuery,
  SubscriptionReportQuery,
  SubscriptionReportsService,
} from './subscription-reports.service';

@UseGuards(JwtAuthGuard)
@Controller('club-subscriptions')
@RequiresPermission(
  'club.subscriptions:view',
  'club.subscriptions.list:view',
  'club.reception:view',
)
export class ClubSubscriptionsController {
  constructor(
    private readonly service: ClubSubscriptionsService,
    private readonly reports: SubscriptionReportsService,
    private readonly renewals: ClubSubscriptionRenewalService,
  ) {}

  @Get()
  list(@Query() query: ListClubSubscriptionsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser, @Query('isSpecial') isSpecial?: string) {
    return this.service.statistics(isSpecial, user);
  }

  @Get('outstanding-report')
  outstandingReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branch') branch?: string,
    @Query('search') search?: string,
    @Query('dateField') dateField?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.outstandingReport({ dateFrom, dateTo, branch, search, dateField }, user);
  }

  @Get('expired-report')
  expiredReport(
    @Query('branch') branch?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.expiredReport({ branch, search }, user);
  }

  @Get('waivers-report')
  waiverReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branch') branch?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.waiverReport({ dateFrom, dateTo, branch, search }, user);
  }

  @Get('user-analytics')
  @RequiresPermission('club.subscriptions.user_analytics:view', 'club.subscriptions:view')
  userAnalytics(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('branch') branch: string | undefined,
    @Query('gender') gender: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.userAnalytics({ startDate, endDate, branch, gender }, user);
  }

  @Get('daily-cashier')
  @RequiresPermission('club.subscriptions.daily_cashier:view')
  dailyCashier(
    @CurrentUser() user: JwtUser,
    @Query('userId') userId?: string,
  ) {
    return this.service.dailyCashierReport(user, userId);
  }

  @Get('reports/summary')
  @RequiresPermission('club.subscriptions.reports:view', 'club.subscriptions.user_analytics:view', 'club.subscriptions:view')
  reportSummary(
    @Query() query: SubscriptionReportQuery,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reports.summary(query, user);
  }

  @Get('reports/monthly-analysis')
  @RequiresPermission('club.subscriptions.reports:view', 'club.subscriptions.user_analytics:view', 'club.subscriptions:view')
  monthlyAnalysis(
    @Query() query: SubscriptionReportQuery,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reports.monthlyAnalysis(query, user);
  }

  @Get('reports/daily-close')
  @RequiresPermission('club.subscriptions.daily_cashier:view')
  dailyClose(
    @Query() query: DailyCloseQuery,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reports.dailyClose(query, user);
  }

  @Post('reports/daily-close/review')
  @RequiresPermission('club.subscriptions.daily_cashier:view')
  reviewDailyClose(
    @Query() query: DailyCloseQuery,
    @Body() body: DailyCloseInput,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reports.transitionDailyClose('review', query, body, user);
  }

  @Post('reports/daily-close/close')
  @RequiresPermission('club.subscriptions.daily_cashier:view')
  closeDailyClose(
    @Query() query: DailyCloseQuery,
    @Body() body: DailyCloseInput,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reports.transitionDailyClose('close', query, body, user);
  }

  @Post('reports/daily-close/reopen')
  @RequiresPermission('club.subscriptions.daily_cashier:view')
  reopenDailyClose(
    @Query() query: DailyCloseQuery,
    @Body() body: DailyCloseInput,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reports.transitionDailyClose('reopen', query, body, user);
  }

  @Get('reports/details')
  @RequiresPermission('club.subscriptions.reports:view', 'club.subscriptions.user_analytics:view', 'club.subscriptions:view')
  reportDetails(
    @Query('dimension') dimension: 'payment' | 'sales' | 'user' | 'status' | 'source' | 'subscriptionType',
    @Query('key') key: string,
    @Query() query: SubscriptionReportQuery & { page?: string; pageSize?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.reports.details(dimension, key, query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission(
    'club.subscriptions:create',
    'club.subscriptions.list:create',
    'club.subscriptions.new:create',
    'club.reception:create',
  )
  create(@Body() body: UpsertClubSubscriptionDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertClubSubscriptionDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission(
    'club.subscriptions:delete',
    'club.subscriptions.list:delete',
    'club.reception:delete',
  )
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Patch(':id/sessions')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  sessions(
    @Param('id', ParseIntPipe) id: number,
    @Body('sessionsUsed', ParseIntPipe) sessionsUsed: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.patchSessions(id, sessionsUsed, user);
  }

  @Post(':id/sessions/use')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  useSession(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.useSession(id, user);
  }

  @Patch(':id/payment')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  payment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ProcessClubPaymentDto,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.processPayment(id, body.paymentAmount, {
      paymentMethod: body.paymentMethod,
      payments: body.payments,
      user,
    });
  }

  @Post(':id/waiver')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  waiver(
    @Param('id', ParseIntPipe) id: number,
    @Body('amount') amount: number,
    @Body('reason') reason: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.processWaiver(id, Number(amount), reason, user);
  }

  @Post(':id/renewal-quote')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  renewalQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: QuoteClubSubscriptionRenewalDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.renewals.quote(id, body, user);
  }

  @Patch(':id/renew')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RenewClubSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.renewals.renew(id, body, user);
  }

  @Post(':id/freeze')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  freeze(
    @Param('id', ParseIntPipe) id: number,
    @Body('days') days: number | undefined,
    @Body('reason') reason: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.freeze(
      id,
      days != null && `${days}`.trim() !== '' ? Number(days) : undefined,
      reason,
      user.sub,
      user,
    );
  }

  @Post(':id/unfreeze')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  unfreeze(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.unfreeze(id, user.sub, user);
  }

  @Patch(':id/transfer-member')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  transferMember(
    @Param('id', ParseIntPipe) id: number,
    @Body('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.transferMember(id, memberId, user);
  }
}
