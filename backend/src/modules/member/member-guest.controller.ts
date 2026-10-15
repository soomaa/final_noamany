import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AppManagementService } from '../app-management/app-management.service';
import { ListAppItemsDto } from '../app-management/dto/app-management.dto';
import { ClubBranchProfilesService } from '../club-branches/club-branch-profiles.service';
import { MemberService } from './member.service';

/**
 * تصفّح كزائر — what a member sees about the club, for someone who has not signed in.
 *
 * A guest picks a branch first, then reads the same catalogue a member of that branch reads:
 * packages, trainers, the class schedule and news. What is deliberately absent is anything
 * personal — no profile, pass/barcode, attendance, points or enrolment. That split is why these
 * live in their own controller rather than as `@Public()` holes in the member controller:
 * nothing here can ever read a `memberId`, so no personal row can leak through a forgotten guard.
 *
 * `memberId` is passed as 0 to the shared service methods — no member row carries that id, so
 * "my rating" and "am I enrolled" resolve to empty for a guest without a separate code path.
 *
 * Already served elsewhere and not duplicated here: `guest/offers`, `guest/trainers`
 * (MemberCompatController), `guest/package-categories` (club-subscriptions),
 * `app/guest-leads` + `guest/leads` (app-management) and `app/cafe/catalog`.
 */
const GUEST_MEMBER_ID = 0;

/**
 * The app-management list services read `skip`/`take` off a real DTO instance, so a plain
 * object literal would silently page wrong. Build the instance and set only the filters a
 * guest is allowed to choose.
 */
function guestListQuery(
  filters: Partial<Pick<ListAppItemsDto, 'isActive' | 'isPublished'>>,
  pageSize?: string,
): ListAppItemsDto {
  const dto = new ListAppItemsDto();
  Object.assign(dto, filters);
  const size = pageSize != null && pageSize !== '' ? Number(pageSize) : NaN;
  if (Number.isInteger(size) && size >= 1 && size <= 100) dto.pageSize = size;
  return dto;
}

@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('guest')
export class MemberGuestController {
  constructor(
    private readonly member: MemberService,
    private readonly appManagement: AppManagementService,
    private readonly branchProfiles: ClubBranchProfilesService,
  ) {}

  private branchId(raw?: string): number {
    const id = raw != null && raw !== '' ? Number(raw) : NaN;
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('اختر الفرع أولاً');
    }
    return id;
  }

  /** The published branch tabs a guest lands on, each with the profile an admin wrote in «الفروع». */
  @Get('branches')
  branches() {
    return this.branchProfiles.listPublic();
  }

  @Get('branches/:branchId')
  branch(@Param('branchId', ParseIntPipe) branchId: number) {
    return this.branchProfiles.findPublic(branchId);
  }

  @Get('packages')
  packages(@Query('branchId') branchId?: string) {
    return this.member.listPackages(this.branchId(branchId));
  }

  @Get('trainers/:id')
  trainerDetail(@Param('id', ParseIntPipe) id: number, @Query('branchId') branchId?: string) {
    return this.member.getTrainer(this.branchId(branchId), GUEST_MEMBER_ID, id);
  }

  @Get('trainers/:id/reviews')
  trainerReviews(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.member.listTrainerReviews(
      this.branchId(branchId),
      id,
      limit != null && limit !== '' ? Number(limit) : undefined,
    );
  }

  @Get('classes')
  classes(@Query('branchId') branchId?: string, @Query('audience') audience?: string) {
    return this.member.listClasses(this.branchId(branchId), GUEST_MEMBER_ID, audience);
  }

  @Get('classes/week')
  classesWeek(@Query('branchId') branchId?: string, @Query('start') start?: string) {
    return this.member.getWeekClasses(this.branchId(branchId), GUEST_MEMBER_ID, start);
  }

  @Get('class-types/:id/schedule')
  classTypeSchedule(@Param('id', ParseIntPipe) id: number, @Query('branchId') branchId?: string) {
    return this.member.getClassTypeSchedule(this.branchId(branchId), id);
  }

  /** Published news only — unlike the admin-facing `app/news`, a guest never sees drafts. */
  @Get('news')
  news(@Query('pageSize') pageSize?: string) {
    return this.appManagement.listNews(guestListQuery({ isPublished: true }, pageSize));
  }

  @Get('about')
  about() {
    return this.appManagement.getAbout();
  }
}
