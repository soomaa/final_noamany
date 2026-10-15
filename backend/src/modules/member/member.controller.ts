import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { MemberJwtAuthGuard } from './guards/member-jwt-auth.guard';
import { MemberAuthService } from './member-auth.service';
import {
  MemberChangePasswordDto,
  MemberCreateInvitationDto,
  MemberDeleteAccountDto,
  MemberLoginDto,
  MemberRateTrainerDto,
  MemberSelectBranchDto,
  MemberSwitchBranchDto,
} from './dto/member.dto';
import { MemberService } from './member.service';

@Controller('member/auth')
export class MemberAuthController {
  constructor(private readonly auth: MemberAuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: MemberLoginDto) {
    // Older iOS/Android clients use `username` even though member identities
    // are phone numbers. Accept both request shapes while keeping `phone` the
    // canonical documented field.
    const phone = dto.phone ?? dto.username;
    if (!phone) throw new BadRequestException('رقم الجوال أو اسم المستخدم مطلوب');
    // A phone enrolled in several branches whose password opens more than one gets the
    // branch picker (`requiresBranchSelection` + `selectionToken`) instead of tokens.
    return this.auth.login(phone, dto.password, dto.branchId);
  }

  /** Exchanges the branch picker's choice for a session (after a multi-branch login). */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('select-branch')
  @HttpCode(200)
  selectBranch(@Body() dto: MemberSelectBranchDto) {
    return this.auth.selectBranch(dto.selectionToken, dto.memberId);
  }

  /** The member's branches for the in-app switcher; `current` marks this session's. */
  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @Get('branches')
  branches(@CurrentMember() member: MemberJwtUser) {
    return this.auth.listBranches(member);
  }

  /** Re-issues the session on another of the member's branches proved at login. */
  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @Post('switch-branch')
  @HttpCode(200)
  switchBranch(@CurrentMember() member: MemberJwtUser, @Body() dto: MemberSwitchBranchDto) {
    return this.auth.switchBranch(member, dto.memberId);
  }

  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentMember() member: MemberJwtUser, @Body() dto: MemberChangePasswordDto) {
    return this.auth.changePassword(member.sub, dto.currentPassword, dto.newPassword, member.linkedMemberIds);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }
}

@Public()
@UseGuards(MemberJwtAuthGuard)
@Controller('member')
export class MemberController {
  constructor(
    private readonly member: MemberService,
    private readonly auth: MemberAuthService,
  ) {}

  @Get('profile')
  profile(@CurrentMember() user: MemberJwtUser) {
    return this.member.getProfile(user.memberId);
  }

  @Post('profile/photo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('m_image', { limits: { fileSize: 5 * 1024 * 1024 } }))
  updateProfilePhoto(
    @CurrentMember() user: MemberJwtUser,
    @UploadedFile() image: Express.Multer.File,
  ) {
    return this.member.updateProfilePhoto(user, image);
  }

  @Get('packages')
  packages(@CurrentMember() user: MemberJwtUser) {
    return this.member.listPackages(user.branchId);
  }

  @Get('trainers')
  trainers(@CurrentMember() user: MemberJwtUser) {
    return this.member.listTrainers(user.branchId);
  }

  /** Trainer profile screen — bio, specializations, presence days and weekly classes in this branch. */
  @Get('trainers/:id')
  trainerDetail(@CurrentMember() user: MemberJwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.member.getTrainer(user.branchId, user.memberId, id);
  }

  /** تقييم المدرب — create or edit the caller's single app rating for this trainer. */
  @Put('trainers/:id/rating')
  @HttpCode(200)
  rateTrainer(
    @CurrentMember() user: MemberJwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MemberRateTrainerDto,
  ) {
    return this.member.rateTrainer(user.branchId, user.memberId, id, dto);
  }

  /** POST alias of PUT trainers/:id/rating for clients that cannot send PUT. */
  @Post('trainers/:id/rating')
  @HttpCode(200)
  rateTrainerPost(
    @CurrentMember() user: MemberJwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MemberRateTrainerDto,
  ) {
    return this.member.rateTrainer(user.branchId, user.memberId, id, dto);
  }

  /** حذف تقييمي — removes only the caller's own app rating for this trainer. */
  @Delete('trainers/:id/rating')
  @HttpCode(200)
  deleteTrainerRating(@CurrentMember() user: MemberJwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.member.deleteTrainerRating(user.branchId, user.memberId, id);
  }

  /** التقييمات — trainer ratings summary + commented reviews (first names only). */
  @Get('trainers/:id/reviews')
  trainerReviews(
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

  @Get('subscriptions')
  subscriptions(@CurrentMember() user: MemberJwtUser) {
    return this.member.listSubscriptions(user.memberId);
  }

  @Post('invitations')
  @HttpCode(201)
  createInvitation(@CurrentMember() user: MemberJwtUser, @Body() dto: MemberCreateInvitationDto) {
    return this.member.createInvitation(user, dto);
  }

  @Get('invitations')
  myInvitations(@CurrentMember() user: MemberJwtUser) {
    return this.member.listMyInvitations(user.memberId);
  }

  @Get('inbody-history')
  inbodyHistory(@CurrentMember() user: MemberJwtUser) {
    return this.member.listInbodyHistory(user.memberId);
  }

  /** سجل الوقف — freeze/suspension history for this member's subscriptions. */
  @Get('freezes')
  freezes(@CurrentMember() user: MemberJwtUser) {
    return this.member.listFreezes(user.memberId);
  }

  /** الاشعارات — list (newest first) with unread count. `?unread=true` filters to unread; `?limit=` caps (max 100). */
  @Get('notifications')
  notifications(
    @CurrentMember() user: MemberJwtUser,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
  ) {
    return this.member.listNotifications(user.memberId, {
      unreadOnly: unread === 'true' || unread === '1',
      limit: limit != null && limit !== '' ? Number(limit) : undefined,
    });
  }

  /** الاشعارات — unread count only (for the app badge). */
  @Get('notifications/unread-count')
  notificationsUnreadCount(@CurrentMember() user: MemberJwtUser) {
    return this.member.getUnreadNotificationCount(user.memberId);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  markAllNotificationsRead(@CurrentMember() user: MemberJwtUser) {
    return this.member.markAllNotificationsRead(user.memberId);
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  markNotificationRead(
    @CurrentMember() user: MemberJwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.member.markNotificationRead(user.memberId, id);
  }

  /** الكلاسات — upcoming classes in the member's branch, grouped by audience. `?audience=men|women|kids|mixed` filters. */
  @Get('classes')
  classes(@CurrentMember() user: MemberJwtUser, @Query('audience') audience?: string) {
    return this.member.listClasses(user.branchId, user.memberId, audience);
  }

  /**
   * جدول الأسبوع — seven days of branch classes starting at `?start=YYYY-MM-DD` (default today).
   * Always returns exactly 7 day entries, including empty ones.
   */
  @Get('classes/week')
  classesWeek(@CurrentMember() user: MemberJwtUser, @Query('start') start?: string) {
    return this.member.getWeekClasses(user.branchId, user.memberId, start);
  }

  /** Weekly grid + trainers for one scheduled ("special") class type in this branch. */
  @Get('class-types/:id/schedule')
  classTypeSchedule(@CurrentMember() user: MemberJwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.member.getClassTypeSchedule(user.branchId, id);
  }

  /**
   * سجل الحضور — real gym check-in days behind the app's streak card.
   * `?from=YYYY-MM-DD&to=YYYY-MM-DD`, both optional; the default window is the last 180 days.
   */
  @Get('attendance')
  attendance(
    @CurrentMember() user: MemberJwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.member.getAttendance(user.memberId, from, to);
  }

  /** سجل النقاط — points log derived from subscriptions (balance + earn history). */
  @Get('points')
  points(@CurrentMember() user: MemberJwtUser) {
    return this.member.listPoints(user.memberId);
  }

  /** Delete only the mobile-app account; the contractual gym membership is retained. */
  @Delete('account')
  @HttpCode(200)
  deleteAccount(
    @CurrentMember() user: MemberJwtUser,
    @Body() dto: MemberDeleteAccountDto,
  ) {
    return this.auth.deleteAccount(user.sub, user.memberId, dto.password);
  }
}
