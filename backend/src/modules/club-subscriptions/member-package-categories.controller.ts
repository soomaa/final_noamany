import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { MemberJwtAuthGuard } from '../member/guards/member-jwt-auth.guard';
import { ClubPackageCategoriesService } from './club-package-categories.service';

/**
 * Member-app home sections ("الفئات"). Lives next to the admin CRUD rather than in the
 * member module so the section rules (system keys, live-promo → offers) stay in one place.
 */
@Public()
@UseGuards(MemberJwtAuthGuard)
@Controller('member')
export class MemberPackageCategoriesController {
  constructor(
    private readonly categories: ClubPackageCategoriesService,
    private readonly config: ConfigService,
  ) {}

  /** The home tiles with per-branch package counts, in admin order. */
  @Get('package-categories')
  packageCategories(@CurrentMember() user: MemberJwtUser) {
    return this.categories.listForBranch(
      user.branchId,
      this.config.get<string>('publicUploadBase') ?? '/uploads',
    );
  }
}

/** Same tiles for the guest (not signed-in) app screens; the branch comes from the query. */
@Public()
@Controller('guest')
export class GuestPackageCategoriesController {
  constructor(
    private readonly categories: ClubPackageCategoriesService,
    private readonly config: ConfigService,
  ) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('package-categories')
  packageCategories(@Query('branchId') branchId?: string) {
    const parsed = branchId != null && branchId !== '' ? Number(branchId) : NaN;
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('حدد فرعًا صحيحًا لعرض المحتوى');
    }
    return this.categories.listForBranch(
      parsed,
      this.config.get<string>('publicUploadBase') ?? '/uploads',
    );
  }
}
