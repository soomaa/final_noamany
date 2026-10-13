import { All, Body, Controller, HttpCode, Param, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { MemberJwtAuthGuard } from './guards/member-jwt-auth.guard';
import { OptionalMemberJwtAuthGuard } from './guards/optional-member-jwt-auth.guard';
import { MemberLegacyApiService } from './member-legacy-api.service';

@Controller('Api/members')
export class MemberLegacyApiController {
  constructor(private readonly legacy: MemberLegacyApiService) {}

  @Public()
  @All('login_app')
  @HttpCode(200)
  login(@Body() body: Record<string, unknown>, @Query() query: Record<string, unknown>) {
    return this.legacy.login({ ...query, ...body });
  }

  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @All('logout_app')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('one80_member_access', { path: '/' });
    response.clearCookie('one80_member_refresh', { path: '/' });
    return this.legacy.logout();
  }

  // ─── Public guest routes (no token needed) ─────────────────────────────────
  // يجب أن تكون قبل catch-all :action حتى تأخذ الأولوية في NestJS

  @Public()
  @All('All_Offers')
  @HttpCode(200)
  publicOffers(@Query() query: Record<string, unknown>) {
    return this.legacy.dispatchPublic('All_Offers', query);
  }

  @Public()
  @All('All_Captains')
  @HttpCode(200)
  publicTrainers(@Query() query: Record<string, unknown>) {
    return this.legacy.dispatchPublic('All_Captains', query);
  }

  @Public()
  @UseGuards(OptionalMemberJwtAuthGuard)
  @All('Subs_List')
  @HttpCode(200)
  publicSubsList(@Query() query: Record<string, unknown>, @CurrentMember() user?: MemberJwtUser) {
    return this.legacy.dispatchPublic('Subs_List', query, user?.branchId);
  }

  @Public()
  @UseGuards(OptionalMemberJwtAuthGuard)
  @All('get_subscriptions_tabs')
  @HttpCode(200)
  publicSubscriptionTabs(@Query() query: Record<string, unknown>, @CurrentMember() user?: MemberJwtUser) {
    return this.legacy.dispatchPublic('get_subscriptions_tabs', query, user?.branchId);
  }

  // ─── Authenticated catch-all ────────────────────────────────────────────────
  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @UseInterceptors(FileInterceptor('paymentProof', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 30 } }))
  @All(':action')
  @HttpCode(200)
  dispatch(
    @CurrentMember() user: MemberJwtUser,
    @Param('action') action: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @UploadedFile() paymentProof?: Express.Multer.File,
  ) {
    return this.legacy.dispatch(user, action, { ...query, ...body }, paymentProof);
  }
}
