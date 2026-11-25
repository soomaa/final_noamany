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
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubMemberGroupsService } from './club-member-groups.service';
import {
  AssignGroupMembersDto,
  MemberGroupQueryDto,
  UpsertMemberGroupDto,
} from './dto/member-group.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-member-groups')
@RequiresPermission('club.members.groups:view')
export class ClubMemberGroupsController {
  constructor(private readonly groups: ClubMemberGroupsService) {}
  @Get() list(@Query() q: MemberGroupQueryDto, @CurrentUser() user: JwtUser) {
    return this.groups.list(q, user);
  }
  @Get('export')
  @RequiresPermission('club.members.groups:export')
  async export(
    @Query() q: MemberGroupQueryDto,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    const buffer = await this.groups.export(q, user);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="member-groups.xlsx"',
    );
    res.send(Buffer.from(buffer));
  }
  @Get(':id/members') members(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: MemberGroupQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.groups.members(id, q, user);
  }
  @Get(':id/discounts') discounts(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: MemberGroupQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.groups.discounts(id, q, user);
  }
  @Post()
  @RequiresPermission('club.members.groups:create')
  create(@Body() dto: UpsertMemberGroupDto, @CurrentUser() user: JwtUser) {
    return this.groups.create(dto, user);
  }
  @Put(':id')
  @RequiresPermission('club.members.groups:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertMemberGroupDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.groups.update(id, dto, user);
  }
  @Delete(':id')
  @RequiresPermission('club.members.groups:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.groups.remove(id, user);
  }
  @Post(':id/members')
  @RequiresPermission('club.members.groups:update')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignGroupMembersDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.groups.assign(id, dto, user);
  }
  @Delete(':id/members/:memberId')
  @RequiresPermission('club.members.groups:delete')
  unassign(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.groups.unassign(id, memberId, user);
  }
}
