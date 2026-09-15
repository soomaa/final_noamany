import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentMember } from "../../common/decorators/current-member.decorator";
import { MemberJwtUser } from "../../common/types/member-jwt-user";
import { MemberJwtAuthGuard } from "./guards/member-jwt-auth.guard";
import { MemberAuthService } from "./member-auth.service";
import {
  MemberChangePasswordDto,
  MemberCreateInvitationDto,
  MemberDeleteAccountDto,
  MemberLoginDto,
} from "./dto/member.dto";
import { MemberService } from "./member.service";
import { OnlineSubscriptionsService } from '../online-subscriptions/online-subscriptions.service';
import { NutritionInput } from '../online-subscriptions/nutrition-calculator';

@Controller("member/auth")
export class MemberAuthController {
  constructor(private readonly auth: MemberAuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  login(@Body() dto: MemberLoginDto) {
    return this.auth.login(dto.phone, dto.password);
  }

  @Public()
  @UseGuards(MemberJwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("change-password")
  @HttpCode(200)
  changePassword(
    @CurrentMember() member: MemberJwtUser,
    @Body() dto: MemberChangePasswordDto,
  ) {
    return this.auth.changePassword(
      member.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body("refreshToken") refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }
}

@Public()
@UseGuards(MemberJwtAuthGuard)
@Controller("member")
export class MemberController {
  constructor(
    private readonly member: MemberService,
    private readonly auth: MemberAuthService,
    private readonly online: OnlineSubscriptionsService,
  ) {}

  @Get("profile")
  profile(@CurrentMember() user: MemberJwtUser) {
    return this.member.getProfile(user.memberId);
  }

  @Get("packages")
  packages(@CurrentMember() user: MemberJwtUser) {
    return this.member.listPackages(user.branchId);
  }

  @Get('trainers')
  trainers(@CurrentMember() user: MemberJwtUser) { return this.member.listTrainers(user.branchId); }

  @Post('nutrition/calculate')
  nutrition(@Body() body: NutritionInput) { return this.online.nutrition(body); }

  @Get("subscriptions")
  subscriptions(@CurrentMember() user: MemberJwtUser) {
    return this.member.listSubscriptions(user.memberId);
  }

  @Post("invitations")
  @HttpCode(201)
  createInvitation(
    @CurrentMember() user: MemberJwtUser,
    @Body() dto: MemberCreateInvitationDto,
  ) {
    return this.member.createInvitation(user, dto);
  }

  @Get("invitations")
  myInvitations(@CurrentMember() user: MemberJwtUser) {
    return this.member.listMyInvitations(user.memberId);
  }

  @Get("inbody-history")
  inbodyHistory(@CurrentMember() user: MemberJwtUser) {
    return this.member.listInbodyHistory(user.memberId);
  }

  /** سجل الوقف — freeze/suspension history for this member's subscriptions. */
  @Get("freezes")
  freezes(@CurrentMember() user: MemberJwtUser) {
    return this.member.listFreezes(user.memberId);
  }

  /** الاشعارات — list (newest first) with unread count. `?unread=true` filters to unread; `?limit=` caps (max 100). */
  @Get("notifications")
  notifications(
    @CurrentMember() user: MemberJwtUser,
    @Query("unread") unread?: string,
    @Query("limit") limit?: string,
  ) {
    return this.member.listNotifications(user.memberId, {
      unreadOnly: unread === "true" || unread === "1",
      limit: limit != null && limit !== "" ? Number(limit) : undefined,
    });
  }

  /** الاشعارات — unread count only (for the app badge). */
  @Get("notifications/unread-count")
  notificationsUnreadCount(@CurrentMember() user: MemberJwtUser) {
    return this.member.getUnreadNotificationCount(user.memberId);
  }

  @Post("notifications/read-all")
  @HttpCode(200)
  markAllNotificationsRead(@CurrentMember() user: MemberJwtUser) {
    return this.member.markAllNotificationsRead(user.memberId);
  }

  @Post("notifications/:id/read")
  @HttpCode(200)
  markNotificationRead(
    @CurrentMember() user: MemberJwtUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.member.markNotificationRead(user.memberId, id);
  }

  /** الكلاسات — upcoming classes in the member's branch, grouped by audience. `?audience=men|women|kids|mixed` filters. */
  @Get("classes")
  classes(
    @CurrentMember() user: MemberJwtUser,
    @Query("audience") audience?: string,
  ) {
    return this.member.listClasses(user.branchId, user.memberId, audience);
  }

  /** سجل النقاط — imported earn/redeem ledger with a subscription fallback. */
  @Get("points")
  points(@CurrentMember() user: MemberJwtUser) {
    return this.member.listPoints(user.memberId);
  }

  /** Delete only the mobile-app account; the contractual gym membership is retained. */
  @Delete("account")
  @HttpCode(200)
  deleteAccount(
    @CurrentMember() user: MemberJwtUser,
    @Body() dto: MemberDeleteAccountDto,
  ) {
    return this.auth.deleteAccount(user.sub, user.memberId, dto.password);
  }
}
