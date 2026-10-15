import { Body, Controller, Get, HttpCode, Inject, Optional, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import {
  DisabledExternalIdentityAdapter,
  EXTERNAL_IDENTITY_ADAPTER,
  ExternalIdentityAdapter,
  ExternalIdentityClaims,
} from '../../ports/identity/external-identity.adapter';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/auth/session-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Optional() @Inject(EXTERNAL_IDENTITY_ADAPTER)
    private readonly externalIdentity: ExternalIdentityAdapter = new DisabledExternalIdentityAdapter(),
    private readonly config: ConfigService,
  ) {}

  private cookieOpts(maxAgeMs: number) {
    const isProd = this.config.get<string>('nodeEnv') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.username, dto.password, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
    // A member whose password opened several branch accounts gets the picker, not a session:
    // no cookies or tokens until the choice is exchanged at /member/auth/select-branch.
    if (result.requiresBranchSelection) return result;
    res.cookie(ACCESS_COOKIE, result.accessToken, this.cookieOpts(2 * 60 * 60 * 1000));
    res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOpts(7 * 24 * 60 * 60 * 1000));
    const safeResult = {
      message: result.message,
      accountType: result.accountType,
      mustChangePassword: result.mustChangePassword,
      user: result.user,
    };
    // External native clients can explicitly retain their bearer-token contract.
    // Staff browser tokens are HttpOnly-cookie only and never exposed to JavaScript.
    return result.exposeTokensInBody
      ? { ...safeResult, accessToken: result.accessToken, refreshToken: result.refreshToken }
      : safeResult;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('انتهت الجلسة');
    const result = (await this.externalIdentity.refresh(token)) ?? await this.auth.refresh(token, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie(ACCESS_COOKIE, result.accessToken, this.cookieOpts(2 * 60 * 60 * 1000));
    res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOpts(7 * 24 * 60 * 60 * 1000));
    return { user: result.user };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentUser() user: JwtUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.sub, user.sessionId);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { message: 'تم تسجيل الخروج' };
  }

  @Public()
  @UseGuards(FlexibleAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const user = req.user as JwtUser | ExternalIdentityClaims;
    if (this.externalIdentity.supportsClaims(user)) {
      return this.externalIdentity.changePassword(user.sub, dto.currentPassword, dto.newPassword, user);
    }
    return this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.getSessionUser(user.sub);
  }
}
