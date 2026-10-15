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
import { ClubMembersService } from './club-members.service';
import { BlockClubMemberDto } from './dto/block-club-member.dto';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { UpsertClubMemberDto } from './dto/upsert-club-member.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-members')
@RequiresPermission('club.members:view', 'club.reception:view')
export class ClubMembersController {
  constructor(private readonly service: ClubMembersService) {}

  @Get()
  list(@Query() query: ListClubMembersDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.statistics(user);
  }

  @Get('sales-portal')
  @RequiresPermission('sales.portal:view')
  salesPortal(@CurrentUser() user: JwtUser) {
    return this.service.salesPortal(user);
  }

  @Get('sales-renewals')
  @RequiresPermission('sales.portal:view')
  salesRenewals(
    @CurrentUser() user: JwtUser,
    @Query('window') window?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.salesRenewals(user, {
      window,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('check-duplicate')
  checkDuplicate(
    @Query('phone') phone?: string,
    @Query('cardNumber') cardNumber?: string,
    @Query('branchId') branchId?: string,
    @Query('excludeMemberId') excludeMemberId?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    const exclude = excludeMemberId ? Number(excludeMemberId) : undefined;
    const branch = branchId ? Number(branchId) : undefined;
    return this.service.checkDuplicates({
      phone,
      cardNumber,
      branchId: branch && !Number.isNaN(branch) ? branch : undefined,
      excludeMemberId: exclude && !Number.isNaN(exclude) ? exclude : undefined,
    }, user);
  }

  @Get('next-code')
  nextCode(@Query('branchId') branchId?: string, @CurrentUser() user?: JwtUser) {
    const parsed = branchId ? Number(branchId) : undefined;
    return this.service.nextCode(parsed && !Number.isNaN(parsed) ? parsed : undefined, user);
  }

  /** All branch-scoped members for subscription/event pickers (no sales-rep ownership filter). */
  @Get('select-options')
  @RequiresPermission('club.members:view', 'club.subscriptions.new:view', 'club.subscriptions.special:view')
  selectOptions(@Query() query: ListClubMembersDto, @CurrentUser() user: JwtUser) {
    query.forSelect = true;
    return this.service.list(query, user);
  }

  @Get(':id/financial-history')
  financialHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.financialHistory(id, user, dateFrom, dateTo);
  }

  @Get(':id/profile-summary')
  @RequiresPermission(
    'club.members:view',
    'club.reception:view',
    'club.members.attendance:view',
  )
  profileSummary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.profileSummary(id, user);
  }

  @Get('potential-leads/:id/phone')
  @RequiresPermission('club.members:view', 'club.reception:view', 'club.leads:view', 'sales.portal:view')
  revealLeadPhone(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.revealLeadPhone(id, user);
  }

  @Get(':id/phone')
  @RequiresPermission('club.members:view', 'club.reception:view', 'club.subscriptions.list:view', 'club.leads:view', 'sales.portal:view')
  revealPhone(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.revealPhone(id, user);
  }

  @Get(':id/deletion-preview')
  deletionPreview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('stopDate') stopDate?: string,
  ) {
    return this.service.deletionPreview(id, user, stopDate);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.members:create')
  create(@Body() body: UpsertClubMemberDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.members:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertClubMemberDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Post(':id/block')
  @RequiresPermission('club.members:update', 'club.reception:update')
  block(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: BlockClubMemberDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.block(id, body.reason, user);
  }

  @Post(':id/unblock')
  @RequiresPermission('club.members:update', 'club.reception:update')
  unblock(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.unblock(id, user);
  }

  @Delete(':id')
  @RequiresPermission('club.members:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
