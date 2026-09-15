import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubEventSettingsService } from './club-event-settings.service';
import { UpsertClubEventSettingsDto } from './dto/upsert-club-event-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-events/settings')
@RequiresPermission('club.events.settings:view')
export class ClubEventSettingsController {
  constructor(private readonly service: ClubEventSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put()
  @RequiresPermission('club.events.settings:configure')
  update(@Body() body: UpsertClubEventSettingsDto, @CurrentUser('sub') userId: number) {
    return this.service.update(body, userId);
  }
}
