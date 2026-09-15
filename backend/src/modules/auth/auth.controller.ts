import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { MemberAuthService } from '../member/member-auth.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

const ACCESS_COOKIE = 'one80_access';
const REFRESH_COOKIE = 'one80_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly memberAuth: MemberAuthService,
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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.username, dto.password);
    res.cookie(ACCESS_COOKIE, result.accessToken, this.cookieOpts(2 * 60 * 60 * 1000));
    res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOpts(7 * 24 * 60 * 60 * 1000));
    return {
      message: result.message,
      accessToken: result.accessToken,
      accountType: result.accountType,
      mustChangePassword: result.mustChangePassword,
      user: result.user,
    };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] ?? (req.body?.refreshToken as string);
    const result = await this.auth.refresh(token);
    res.cookie(ACCESS_COOKIE, result.accessToken, this.cookieOpts(2 * 60 * 60 * 1000));
    return { accessToken: result.accessToken, user: result.user };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { message: 'تم تسجيل الخروج' };
  }

  @Public()
  @UseGuards(ThrottlerGuard, FlexibleAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(200)
  changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const user = req.user as JwtUser | MemberJwtUser;
    if ((user as MemberJwtUser).type === 'member') {
      return this.memberAuth.changePassword(user.sub, dto.currentPassword, dto.newPassword);
    }
    return this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.getSessionUser(user.sub);
  }
}
