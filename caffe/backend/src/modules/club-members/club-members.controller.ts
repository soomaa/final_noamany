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

  @Get('check-duplicate')
  checkDuplicate(
    @Query('phone') phone?: string,
    @Query('cardNumber') cardNumber?: string,
    @Query('excludeMemberId') excludeMemberId?: string,
  ) {
    const exclude = excludeMemberId ? Number(excludeMemberId) : undefined;
    return this.service.checkDuplicates({
      phone,
      cardNumber,
      excludeMemberId: exclude && !Number.isNaN(exclude) ? exclude : undefined,
    });
  }

  @Get('next-code')
  nextCode(@Query('branchId') branchId?: string) {
    const parsed = branchId ? Number(branchId) : undefined;
    return this.service.nextCode(parsed && !Number.isNaN(parsed) ? parsed : undefined);
  }

  /** All branch-scoped members for subscription/event pickers (no sales-rep ownership filter). */
  @Get('select-options')
  @RequiresPermission('club.members:view', 'club.subscriptions:view')
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

  @Delete(':id')
  @RequiresPermission('club.members:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
