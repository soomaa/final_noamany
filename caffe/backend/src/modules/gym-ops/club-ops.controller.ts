import { Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards, Body } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { BusinessAuditService } from './business-audit.service';
import { EntitlementService } from './entitlement.service';
import { ClubSearchService } from './club-search.service';
import { AutomationService } from './automation.service';
import { ClubCalendarService } from './club-calendar.service';
import { ValidateEntitlementDto } from './dto/gym-ops.dto';
import { UpdateClubGymPoliciesDto } from './dto/club-gym-policies.dto';
import { ClubGymPoliciesService } from './club-gym-policies.service';
import { BranchesService } from '../branches/branches.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club')
export class ClubOpsController {
  constructor(
    private readonly search: ClubSearchService,
    private readonly entitlement: EntitlementService,
    private readonly audit: BusinessAuditService,
    private readonly automation: AutomationService,
    private readonly calendar: ClubCalendarService,
    private readonly gymPolicies: ClubGymPoliciesService,
    private readonly branchesService: BranchesService,
    private readonly branchScope: BranchScopeService,
  ) {}

  @Get('branch-options')
  @RequiresPermission(
    'club.packages.settings:view',
    'club.subscriptions:view',
    'club.members:view',
    'org.branches:view',
    'gym-sales.sales.new_receipt:view',
    'gym-sales.sales.drafts:view',
    'gym-sales.sales.shifts:view',
    'gym-sales.sales.treasury:view',
    'gym-sales.sales.settlements:view',
    'gym-sales.inventory.dashboard:view',
    'gym-sales.inventory.raw_materials:view',
    'gym-sales.procurement.cafe_purchases:view',
  )
  async branchOptions(@CurrentUser() user: JwtUser) {
    const branches = await this.branchesService.findAll();
    const allowed = this.branchScope.allowedBranchIds(user);
    return allowed === null ? branches : branches.filter((branch) => allowed.includes(branch.id));
  }

  @Get('search')
  @RequiresPermission('club.members:view', 'club.reception:view')
  universalSearch(
    @Query('q') q: string,
    @Query('branchId') branchId?: string,
    @Query('withEntitlement') withEntitlement?: string,
  ) {
    const bid = branchId && branchId !== 'all' ? Number(branchId) : undefined;
    if (withEntitlement === 'true' || withEntitlement === '1') {
      return this.search.searchWithEntitlement(q ?? '', bid);
    }
    return this.search.universalSearch(q ?? '', bid);
  }

  @Get('search/recent-checkins')
  @RequiresPermission('club.members:view', 'club.reception:view')
  recentCheckIns(@Query('limit') limit?: string, @Query('branchId') branchId?: string) {
    const bid = branchId && branchId !== 'all' ? Number(branchId) : undefined;
    return this.search.recentCheckIns(limit ? Number(limit) : 20, bid);
  }

  @Get('entitlement/validate')
  @RequiresPermission('club.members:view', 'club.reception:view')
  validateEntitlement(@Query() query: ValidateEntitlementDto) {
    return this.entitlement.validate({
      memberId: query.memberId,
      branchId: query.branchId,
    });
  }

  @Get('gym-policies')
  @RequiresPermission('admin.gym-policies:view', 'club.subscriptions:view')
  getGymPolicies() {
    return this.gymPolicies.get();
  }

  @Patch('gym-policies')
  @RequiresPermission('admin.gym-policies:update', 'club:update')
  updateGymPolicies(@Body() body: UpdateClubGymPoliciesDto) {
    return this.gymPolicies.update(body);
  }

  @Get('audit')
  @RequiresPermission('admin.audit:view')
  listAudit(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.list({
      entityType,
      entityId,
      action,
      branchId: branchId ? Number(branchId) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 25,
    });
  }

  @Get('audit/:entityType/:entityId')
  @RequiresPermission('club.members:view')
  entityAudit(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.audit.forEntity(entityType, entityId);
  }

  @Get('automation/workflows')
  @RequiresPermission('admin.roles:view')
  listWorkflows() {
    return this.automation.listWorkflows();
  }

  @Patch('automation/workflows/:id/toggle')
  @RequiresPermission('admin.roles:manage')
  toggleWorkflow(@Param('id', ParseIntPipe) id: number, @Query('active') active: string) {
    return this.automation.toggleWorkflow(id, active === 'true' || active === '1');
  }

  @Get('automation/runs')
  @RequiresPermission('admin.audit:view')
  listRuns(
    @Query('workflowId') workflowId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.automation.listRuns(
      workflowId ? Number(workflowId) : undefined,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 25,
    );
  }

  @Get('automation/tasks')
  @RequiresPermission('club.members:view')
  listTasks(
    @Query('status') status?: string,
    @Query('memberId') memberId?: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.automation.listTasks({
      status: status as 'open' | 'in_progress' | 'completed' | 'cancelled' | undefined,
      memberId: memberId ? Number(memberId) : undefined,
      branchId: branchId ? Number(branchId) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 25,
    });
  }

  @Patch('automation/tasks/:id/status')
  @RequiresPermission('club.members:update')
  updateTaskStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status: string,
  ) {
    return this.automation.updateTaskStatus(
      id,
      status as 'open' | 'in_progress' | 'completed' | 'cancelled',
    );
  }

  @Post('automation/run-scheduled')
  @RequiresPermission('admin.roles:manage')
  runScheduled() {
    return this.automation.runScheduled();
  }

  @Get('calendar/events')
  @RequiresPermission('club.fitness:view')
  calendarEvents(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('trainerId') trainerId?: string,
  ) {
    return this.calendar.listEvents({
      from,
      to,
      branchId: branchId && branchId !== 'all' ? Number(branchId) : undefined,
      trainerId: trainerId ? Number(trainerId) : undefined,
    });
  }

  @Post('calendar/conflicts')
  @RequiresPermission('club.fitness:view')
  calendarConflicts(@Body() body: Record<string, unknown>) {
    return this.calendar.detectConflicts(body as Parameters<ClubCalendarService['detectConflicts']>[0]);
  }

  @Patch('calendar/classes/:id/move')
  @RequiresPermission('club.fitness:update')
  moveClass(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.calendar.moveClass(id, body as { classDate?: string; startTime?: string; endTime?: string; hallId?: number | null });
  }

  @Post('calendar/recurring')
  @RequiresPermission('club.fitness:create')
  createRecurring(@Body() body: Record<string, unknown>) {
    return this.calendar.createRecurring(body as Parameters<ClubCalendarService['createRecurring']>[0]);
  }

  @Get('backup/members.csv')
  @RequiresPermission('admin.audit:export')
  async exportMembersCsv(@Res() res: Response, @Query('branchId') branchId?: string) {
    const csv = await this.calendar.exportMembersCsv(branchId && branchId !== 'all' ? Number(branchId) : undefined);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="members-export.csv"');
    res.send('\uFEFF' + csv);
  }

  @Get('backup/subscriptions.csv')
  @RequiresPermission('admin.audit:export')
  async exportSubscriptionsCsv(@Res() res: Response, @Query('branchId') branchId?: string) {
    const csv = await this.calendar.exportSubscriptionsCsv(branchId && branchId !== 'all' ? Number(branchId) : undefined);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="subscriptions-export.csv"');
    res.send('\uFEFF' + csv);
  }
}
