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
import { ClubGroupOperation } from '../../common/branch-groups/club-operation-scope';
import {
  FreezeClubSubscriptionDto,
  ProcessClubPaymentDto,
  RenewClubSubscriptionDto,
} from './dto/club-subscription-payment.dto';
import { ListClubSubscriptionsDto } from './dto/list-club-subscriptions.dto';
import { UpsertClubSubscriptionDto } from './dto/upsert-club-subscription.dto';
import {
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
  ) {}

  @Get()
  @RequiresPermission('club.subscriptions:view', 'club.subscriptions.list:view', 'club.reception:view', 'club.subscriptions.member_transfer:view')
  list(@Query() query: ListClubSubscriptionsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(
    @CurrentUser() user: JwtUser,
    @Query('isSpecial') isSpecial?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.statistics(isSpecial, user, dateFrom, dateTo);
  }

  @Get('member-transfer-sources')
  @ClubGroupOperation()
  @RequiresPermission('club.subscriptions.member_transfer:view', 'club.subscriptions.member_transfer:create', 'club.subscriptions:view', 'club.subscriptions.list:view', 'club.reception:view', 'club.subscriptions:update', 'club.subscriptions.list:update', 'club.reception:update')
  memberTransferSources(@Query() query: ListClubSubscriptionsDto, @CurrentUser() user: JwtUser) {
    return this.service.listTransferSources(query, user);
  }

  @Get('refund-sources')
  @ClubGroupOperation()
  @RequiresPermission('club.subscriptions.refunds:view', 'club.subscriptions:update', 'club.subscriptions.list:update', 'club.reception:update')
  refundSources(@Query() query: ListClubSubscriptionsDto, @CurrentUser() user: JwtUser) {
    return this.service.listRefundSources(query, user);
  }

  @Get('operation-branch-options')
  @ClubGroupOperation()
  @RequiresPermission('club.subscriptions.member_transfer:view', 'club.subscriptions.member_transfer:create', 'club.subscriptions.refunds:view', 'club.subscriptions:update', 'club.subscriptions.list:update', 'club.reception:update')
  operationBranchOptions(@CurrentUser() user: JwtUser) {
    return this.service.operationBranchOptions(user);
  }

  @Get('operation-subscription/:id')
  @ClubGroupOperation()
  @RequiresPermission('club.subscriptions.member_transfer:view', 'club.subscriptions.member_transfer:create', 'club.subscriptions.refunds:view', 'club.subscriptions:update', 'club.subscriptions.list:update', 'club.reception:update')
  operationSubscription(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.operationSubscription(id, user);
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
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.expiredReport({ branch, search, page, pageSize }, user);
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
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.userAnalytics({ startDate, endDate, branch }, user);
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

  @Patch(':id/renew')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RenewClubSubscriptionDto,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.renew(id, body.renewalDays, {
      paidAmount: body.paidAmount,
      paymentMethod: body.paymentMethod,
      payments: body.payments,
      user,
    });
  }

  @Post(':id/freeze')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  freeze(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: FreezeClubSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.freeze(
      id,
      body.days,
      body.reason,
      user.sub,
      user,
      body.freezeStartDate,
      body.freezeEndDate,
    );
  }

  @Patch(':id/freeze')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  updateFreeze(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: FreezeClubSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateFreeze(id, body.freezeEndDate, body.reason, user.sub, user);
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
