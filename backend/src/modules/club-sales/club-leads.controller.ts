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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubLeadsService } from './club-leads.service';
import {
  AssignLeadDto,
  CompleteLeadReminderDto,
  CreateLeadDto,
  FollowUpLeadDto,
  ListLeadsDto,
  UpsertLeadDto,
} from './dto/leads.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-leads')
export class ClubLeadsController {
  constructor(private readonly service: ClubLeadsService) {}

  @Get()
  @RequiresPermission('club.leads:view', 'sales.portal:view')
  list(@Query() query: ListLeadsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('mine')
  @RequiresPermission('sales.portal:view', 'club.leads:view')
  mine(@CurrentUser() user: JwtUser, @Query() query: ListLeadsDto) {
    return this.service.mine(user, query);
  }

  @Get('reminders')
  @RequiresPermission('sales.portal:view')
  reminders(@CurrentUser() user: JwtUser, @Query() query: ListLeadsDto) {
    return this.service.reminders(user, query);
  }

  @Post(':id/reminders/complete')
  @RequiresPermission('sales.portal:update')
  completeReminder(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CompleteLeadReminderDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.completeReminder(id, body, user);
  }

  @Get('template')
  @RequiresPermission('club.leads:export', 'club.leads:create')
  template(@Res() res: Response) {
    return this.service.downloadTemplate(res);
  }

  @Get('export')
  @RequiresPermission('club.leads:export')
  export(@Query() query: ListLeadsDto, @CurrentUser() user: JwtUser, @Res() res: Response) {
    return this.service.exportExcel(query, user, res);
  }

  @Get('renewal-candidates')
  @RequiresPermission('club.leads:view')
  renewalCandidates(
    @Query('state') state: string | undefined,
    @Query('branch') branch: string | undefined,
    @Query('days') days: string | undefined,
    @Query('search') search: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listRenewalCandidates({
      state,
      branch,
      search,
      days: days ? Number(days) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }, user);
  }

  @Post('renewal-candidates/convert')
  @RequiresPermission('club.leads:create')
  convertRenewalCandidates(
    @Body() body: { state?: string; branch?: string; days?: number; search?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.convertRenewalCandidates(body ?? {}, user);
  }

  @Get('renewal-handoff')
  @RequiresPermission('club.leads:export')
  renewalHandoff(
    @Query('state') state: string | undefined,
    @Query('branch') branch: string | undefined,
    @Query('days') days: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    return this.service.exportRenewalHandoff(
      { state, branch, search, days: days ? Number(days) : undefined },
      user,
      res,
    );
  }

  @Get('meta')
  @RequiresPermission('club.leads:view', 'sales.portal:view')
  meta() {
    return this.service.meta();
  }

  @Get('packages')
  @RequiresPermission('club.leads:view', 'sales.portal:view')
  packages() {
    return this.service.listInterestedPackages();
  }

  @Post('renewal/:memberId/ensure')
  @RequiresPermission('sales.portal:update')
  ensureRenewalLead(
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.ensureRenewalLead(memberId, user);
  }

  @Get(':id')
  @RequiresPermission('club.leads:view', 'sales.portal:view')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.leads:create')
  create(@Body() body: CreateLeadDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Post('import')
  @RequiresPermission('club.leads:create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  importExcel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.importExcel(file, user, branchId ? Number(branchId) : undefined);
  }

  @Post('distribute-unassigned')
  @RequiresPermission('club.leads:update', 'club.sales.dashboard:update')
  distributeUnassigned(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.distributeUnassigned(user, branchId ? Number(branchId) : undefined);
  }

  @Put(':id')
  @RequiresPermission('club.leads:update', 'sales.portal:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertLeadDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Post(':id/follow-up')
  @RequiresPermission('club.leads:update', 'sales.portal:update')
  followUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: FollowUpLeadDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.followUp(id, body, user);
  }

  @Post(':id/assign')
  @RequiresPermission('club.leads:update', 'club.sales.dashboard:update')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignLeadDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.assign(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.leads:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
