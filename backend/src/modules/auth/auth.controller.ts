import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { UploadsService } from '../uploads/uploads.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileNameDto } from './dto/update-profile.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeForLogin, employeeSells } from '../employees/sales-attribution.util';

const ACCESS_COOKIE = 'one80_access';
const REFRESH_COOKIE = 'one80_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly memberAuth: MemberAuthService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
    private readonly branchScope: BranchScopeService,
    private readonly prisma: PrismaService,
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
  async me(@CurrentUser() user: JwtUser) {
    const session = await this.auth.getSessionUser(user.sub);
    // The men/women section the club screens OPEN on (a default the employee can switch to الكل):
    // null = both. From the request user so active section exceptions count too.
    const memberGender = this.branchScope.defaultMemberSection(user);
    // For the sales screens ported from MetaFit: `employeeId` is the employees.id every sales
    // dropdown is keyed by, and `isSalesRep` lets the client lock the attribution field to the
    // rep. Presentation only — the server enforces ownership on every write.
    const employee = await employeeForLogin(this.prisma, session.emp_code).catch(() => null);
    return {
      ...session,
      member_gender: memberGender,
      member_sections: user.member_sections ?? null,
      employeeId: employee?.id ?? null,
      isSalesRep: employeeSells(employee),
    };
  }

  /** الملف الشخصي: the signed-in user renames their own account (MetaFit). */
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileNameDto) {
    return this.auth.updateProfileName(user.sub, dto.name);
  }

  /** The JWT supplies the owner, so this route can never change another employee's photo. */
  @UseGuards(JwtAuthGuard)
  @Post('profile-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async updateProfileImage(@CurrentUser() user: JwtUser, @UploadedFile() file: Express.Multer.File) {
    const upload = this.uploads.store('emp-photo', file);
    return this.auth.updateProfileImage(user.sub, upload.path);
  }
}
