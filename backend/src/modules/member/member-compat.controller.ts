import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AmInvitationStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { AppManagementService } from '../app-management/app-management.service';
import {
  ListInvitationsDto,
  UpdateInvitationDto,
} from '../app-management/dto/app-management.dto';
import { MemberJwtAuthGuard } from './guards/member-jwt-auth.guard';
import { MemberService } from './member.service';
import { MemberCreateInvitationDto } from './dto/member.dto';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';

/**
 * Flutter-requested URL aliases (exact paths from the mobile spec).
 * Canonical routes also exist under /api/member/* and /api/app/*.
 */
@Controller()
export class MemberCompatController {
  constructor(
    private readonly member: MemberService,
    private readonly appManagement: AppManagementService,
    private readonly permissions: PermissionEngineService,
  ) {}

  private invitationResource(status: AmInvitationStatus) {
    return `app-management.invitations.${status === 'pending' ? 'sent' : status}`;
  }

  private guestBranchId(branchId?: string) {
    const parsed = branchId != null && branchId !== '' ? Number(branchId) : NaN;
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('حدد فرعًا صحيحًا لعرض المحتوى');
    }
    return parsed;
  }

  private async assertInvitationPermission(
    userId: number,
    status: AmInvitationStatus,
    action: 'view' | 'update',
  ) {
    if (
      !(await this.permissions.can(
        userId,
        this.invitationResource(status),
        action,
      ))
    ) {
      throw new ForbiddenException('ليس لديك صلاحية لهذا النوع من الدعوات');
    }
  }

  /** GET /api/packages — public pricing screen (active plans shown in app). */
  @Public()
  @Get('packages')
  publicPackages(@Query('branchId') branchId?: string) {
    const bid = branchId != null && branchId !== '' ? Number(branchId) : NaN;
    if (!Number.isInteger(bid) || bid <= 0) {
      throw new ForbiddenException('حدد الفرع لعرض الباقات المتاحة له');
    }
    return this.member.listPackages(bid);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('guest/offers')
  async guestOffers(@Query('branchId') branchId?: string) {
    const bid = this.guestBranchId(branchId);
    const packages = (await this.member.listPackages(bid)) as Array<{
      id: number;
      name: string;
      isSpecialOffer?: boolean;
      promoEnabled?: boolean;
      promoMarketingMessage?: string | null;
      promoImage?: string | null;
      promoDiscountPercent?: number | null;
      promoEndsAt?: Date | string | null;
    }>;
    return packages
      .filter((item) => item.isSpecialOffer || item.promoEnabled)
      .map((item) => ({
        id: item.id,
        title: item.name,
        branchId: bid,
        ...(item.promoMarketingMessage != null
          ? { marketingMessage: item.promoMarketingMessage }
          : {}),
        ...(item.promoImage != null ? { imageUrl: item.promoImage } : {}),
        ...(item.promoDiscountPercent != null
          ? { discountPercent: item.promoDiscountPercent }
          : {}),
        ...(item.promoEndsAt != null ? { endsAt: item.promoEndsAt } : {}),
      }));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('guest/trainers')
  async guestTrainers(@Query('branchId') branchId?: string) {
    const bid = this.guestBranchId(branchId);
    const trainers = await (
      this.member as MemberService & {
        listTrainers(branchId: number): Promise<
          Array<{
            id: number;
            name: string;
            specialization?: string | null;
            experience?: number | null;
            bio?: string | null;
            imageUrl?: string | null;
            rating?: number | null;
          }>
        >;
      }
    ).listTrainers(bid);
    return trainers.map((trainer) => ({
      id: trainer.id,
      name: trainer.name,
      specialization: trainer.specialization,
      experience: trainer.experience,
      bio: trainer.bio,
      imageUrl: trainer.imageUrl,
      rating: trainer.rating,
      branchId: bid,
    }));
  }

  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @Get('trainers')
  memberTrainers(@CurrentMember() user: MemberJwtUser) {
    return this.member.listTrainers(user.branchId);
  }

  /** GET /api/trainers/:id — alias of GET /api/member/trainers/:id. */
  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @Get('trainers/:id')
  memberTrainerDetail(@CurrentMember() user: MemberJwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.member.getTrainer(user.branchId, user.memberId, id);
  }

  /** GET /api/trainers/:id/reviews — alias of GET /api/member/trainers/:id/reviews. */
  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @Get('trainers/:id/reviews')
  memberTrainerReviews(
    @CurrentMember() user: MemberJwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    return this.member.listTrainerReviews(
      user.branchId,
      id,
      limit != null && limit !== '' ? Number(limit) : undefined,
    );
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
  memberCreateInvitation(
    @CurrentMember() user: MemberJwtUser,
    @Body() dto: MemberCreateInvitationDto,
  ) {
    return this.member.createInvitation(user, dto);
  }

  /** GET /api/invitations — admin list (alias for /api/app/invitations). */
  @UseGuards(JwtAuthGuard)
  @Get('invitations')
  @RequiresPermission(
    'app-management.invitations.sent:view',
    'app-management.invitations.accepted:view',
    'app-management.invitations.attended:view',
    'app-management.invitations.rejected:view',
  )
  async adminListInvitations(
    @Query() query: ListInvitationsDto,
    @CurrentUser('sub') userId: number,
  ) {
    if (!query.status)
      throw new ForbiddenException('حدد حالة الدعوات المطلوب عرضها');
    await this.assertInvitationPermission(userId, query.status, 'view');
    return this.appManagement.listInvitations(query);
  }

  /** PUT /api/invitations/:id/status — admin approve/reject. */
  @UseGuards(JwtAuthGuard)
  @Put('invitations/:id/status')
  @RequiresPermission(
    'app-management.invitations.sent:update',
    'app-management.invitations.accepted:update',
    'app-management.invitations.attended:update',
    'app-management.invitations.rejected:update',
  )
  async adminUpdateInvitationStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: AmInvitationStatus; rejectionReason?: string },
    @CurrentUser('sub') userId: number,
  ) {
    await this.assertInvitationPermission(
      userId,
      await this.appManagement.invitationStatus(id),
      'update',
    );
    const dto: UpdateInvitationDto = {
      status: body.status,
      rejectionReason: body.rejectionReason,
    };
    return this.appManagement.updateInvitation(id, dto);
  }
}
