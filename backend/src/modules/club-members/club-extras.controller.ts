import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { assertCapacity } from '../../common/validators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';

async function syncGroupCount(client: Prisma.TransactionClient | PrismaService, groupId: number) {
  const count = await client.club_member_group_members.count({ where: { group_id: groupId } });
  await client.club_member_groups.update({
    where: { id: groupId },
    data: { current_members: count },
  });
}

@UseGuards(JwtAuthGuard)
@Controller('club-member-groups')
@RequiresPermission('club.members.groups:view')
export class ClubMemberGroupsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  @Get()
  async list(@CurrentUser() user: JwtUser) {
    const scope = this.branchScope.allowedBranchIds(user);
    const rows = await this.prisma.club_member_groups.findMany({
      where: { is_active: true },
      orderBy: { id: 'desc' },
      include: {
        _count: {
          select: {
            members: scope === null ? true : { where: { member: { branch_id: { in: scope } } } },
          },
        },
      },
    });
    return rows.map((g) => ({
      ...g,
      current_members: g._count.members,
    }));
  }

  @Post()
  @RequiresPermission('club.members.groups:create')
  create(@Body() body: { name: string; category?: string; maxMembers?: number }) {
    return this.prisma.club_member_groups.create({
      data: {
        name: body.name,
        category: body.category ?? 'عام',
        max_members: body.maxMembers ?? 0,
        current_members: 0,
      },
    });
  }

  @Put(':id')
  @RequiresPermission('club.members.groups:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.prisma.club_member_groups.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name) } : {}),
        ...(body.category != null ? { category: String(body.category) } : {}),
        ...(body.maxMembers != null ? { max_members: Number(body.maxMembers) } : {}),
      },
    });
  }

  @Delete(':id')
  @RequiresPermission('club.members.groups:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.club_member_groups.update({ where: { id }, data: { is_active: false } });
    return { ok: true };
  }

  @Post(':id/members')
  @RequiresPermission('club.members.groups:update')
  async assignMember(
    @Param('id', ParseIntPipe) groupId: number,
    @Body() body: { memberId: number },
    @CurrentUser() user: JwtUser,
  ) {
    const group = await this.prisma.club_member_groups.findFirst({
      where: { id: groupId, is_active: true },
      include: { _count: { select: { members: true } } },
    });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    const member = await this.prisma.club_members.findFirst({
      where: { id: body.memberId, is_deleted: false },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    if (!this.branchScope.isBranchAllowed(user, member.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }

    const existing = await this.prisma.club_member_group_members.findUnique({
      where: { member_id: body.memberId },
    });
    if (existing?.group_id === groupId) {
      return { ok: true, memberId: body.memberId, groupId };
    }

    if (group.max_members > 0) {
      assertCapacity(group._count.members, group.max_members, 1, 'المجموعة ممتلئة');
    }

    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.club_member_group_members.delete({ where: { member_id: body.memberId } });
        await syncGroupCount(tx, existing.group_id);
      }
      await tx.club_member_group_members.create({
        data: { group_id: groupId, member_id: body.memberId },
      });
      await syncGroupCount(tx, groupId);
    });

    return { ok: true, memberId: body.memberId, groupId };
  }

  @Delete(':id/members/:memberId')
  @RequiresPermission('club.members.groups:delete')
  async unassignMember(
    @Param('id', ParseIntPipe) groupId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
      select: { branch_id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    if (!this.branchScope.isBranchAllowed(user, member.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    const link = await this.prisma.club_member_group_members.findFirst({
      where: { group_id: groupId, member_id: memberId },
    });
    if (!link) throw new NotFoundException('العضو غير مرتبط بهذه المجموعة');
    await this.prisma.club_member_group_members.delete({ where: { id: link.id } });
    await syncGroupCount(this.prisma, groupId);
    return { ok: true };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-surveys')
@RequiresPermission('club.members.surveys:view')
export class ClubSurveysController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  @Get()
  list() {
    return this.prisma.club_surveys.findMany({ orderBy: { id: 'desc' } });
  }

  @Post()
  @RequiresPermission('club.members.surveys:create')
  create(@Body() body: { title: string; questions?: string[] }) {
    return this.prisma.club_surveys.create({
      data: {
        title: body.title,
        status: 'pending',
        questions_json: body.questions?.length ? body.questions : undefined,
      },
    });
  }

  @Put(':id')
  @RequiresPermission('club.members.surveys:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; status?: string; questions?: string[] },
  ) {
    return this.prisma.club_surveys.update({
      where: { id },
      data: {
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.status != null ? { status: body.status } : {}),
        ...(body.questions != null ? { questions_json: body.questions } : {}),
      },
    });
  }

  @Post(':id/responses')
  @RequiresPermission('club.members.surveys:create')
  async submitResponse(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { memberId?: number; answers?: Prisma.InputJsonValue },
    @CurrentUser() user?: JwtUser,
  ) {
    const survey = await this.prisma.club_surveys.findUnique({ where: { id } });
    if (!survey) throw new NotFoundException('الاستبيان غير موجود');
    if (survey.status !== 'active') {
      throw new BadRequestException('الاستبيان غير نشط');
    }
    if (body.memberId != null) {
      const member = await this.prisma.club_members.findFirst({
        where: { id: body.memberId, is_deleted: false },
        select: { branch_id: true },
      });
      if (!member) throw new NotFoundException('العضو غير موجود');
      if (!this.branchScope.isBranchAllowed(user, member.branch_id)) {
        throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const response = await tx.club_survey_responses.create({
        data: {
          survey_id: id,
          member_id: body.memberId ?? null,
          answers_json: body.answers ?? undefined,
        },
      });
      await tx.club_surveys.update({
        where: { id },
        data: { responses_count: { increment: 1 } },
      });
      return response;
    });
  }

  @Delete(':id')
  @RequiresPermission('club.members.surveys:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.club_surveys.delete({ where: { id } });
  }
}
