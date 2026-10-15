import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { TrainerPortalService } from './trainer-portal.service';

@UseGuards(JwtAuthGuard)
@Controller('trainer-portal')
export class TrainerPortalController {
  constructor(private readonly service: TrainerPortalService) {}

  @Get('schedule')
  schedule(
    @CurrentUser() user: JwtUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.schedule(user, { dateFrom, dateTo });
  }

  @Get('dashboard')
  dashboard(
    @CurrentUser() user: JwtUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.dashboard(user, { dateFrom, dateTo });
  }
}
