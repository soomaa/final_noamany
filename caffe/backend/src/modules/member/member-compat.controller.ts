import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AmInvitationStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { AppManagementService } from '../app-management/app-management.service';
import { ListInvitationsDto, UpdateInvitationDto } from '../app-management/dto/app-management.dto';
import { MemberJwtAuthGuard } from './guards/member-jwt-auth.guard';
import { MemberService } from './member.service';
import { MemberCreateInvitationDto } from './dto/member.dto';

/**
 * Flutter-requested URL aliases (exact paths from the mobile spec).
 * Canonical routes also exist under /api/member/* and /api/app/*.
 */
@Controller()
export class MemberCompatController {
  constructor(
    private readonly member: MemberService,
    private readonly appManagement: AppManagementService,
  ) {}

  /** GET /api/packages — public pricing screen (active plans shown in app). */
  @Public()
  @Get('packages')
  publicPackages(@Query('branchId') branchId?: string) {
    const bid = branchId != null && branchId !== '' ? Number(branchId) : undefined;
    return this.member.listPackages(Number.isFinite(bid) ? bid : undefined);
  }

  /** GET /api/member/privacy-policy — public, shown pre-login on the consent screen. */
  @Public()
  @Get('member/privacy-policy')
  privacyPolicy() {
    return this.member.getPrivacyPolicy();
  }

  /** GET /api/member/terms — public terms & conditions (companion to privacy policy). */
  @Public()
  @Get('member/terms')
  terms() {
    return this.member.getTerms();
  }

  /** POST /api/invitations — member submits invite from mobile app. */
  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @Post('invitations')
  @HttpCode(201)
  memberCreateInvitation(@CurrentMember() user: MemberJwtUser, @Body() dto: MemberCreateInvitationDto) {
    return this.member.createInvitation(user, dto);
  }

  /** GET /api/invitations — admin list (alias for /api/app/invitations). */
  @UseGuards(JwtAuthGuard)
  @Get('invitations')
  @RequiresPermission('app-management.invitations:view')
  adminListInvitations(@Query() query: ListInvitationsDto) {
    return this.appManagement.listInvitations(query);
  }

  /** PUT /api/invitations/:id/status — admin approve/reject. */
  @UseGuards(JwtAuthGuard)
  @Put('invitations/:id/status')
  @RequiresPermission('app-management.invitations:update')
  adminUpdateInvitationStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: AmInvitationStatus; rejectionReason?: string },
  ) {
    const dto: UpdateInvitationDto = {
      status: body.status,
      rejectionReason: body.rejectionReason,
    };
    return this.appManagement.updateInvitation(id, dto);
  }
}
