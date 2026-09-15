import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { MemberJwtAuthGuard } from './guards/member-jwt-auth.guard';

/**
 * Temporary member-facing endpoints for the Online Coach tabs.
 * They intentionally return an empty state until the online coaching feature is enabled.
 */
@Public()
@UseGuards(MemberJwtAuthGuard)
@Controller('member/online-coaching')
export class OnlineCoachingMemberController {
  @Get('nutrition')
  nutrition() {
    return this.emptyState();
  }

  @Get('workouts')
  workouts() {
    return this.emptyState();
  }

  @Get('chat')
  chat() {
    return this.emptyState();
  }

  @Get('coach-notes')
  coachNotes() {
    return this.emptyState();
  }

  private emptyState() {
    return { data: [], message: 'لا يوجد بيانات حاليًا' };
  }
}
