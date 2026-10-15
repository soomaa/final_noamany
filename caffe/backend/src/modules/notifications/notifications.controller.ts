import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser('sub') userId: number) {
    return this.notifications.list(userId);
  }

  @Get('count')
  count(@CurrentUser('sub') userId: number) {
    return this.notifications.count(userId);
  }

  @Get('alerts')
  alerts() {
    return this.notifications.alerts();
  }

  @Patch('read-all')
  readAll(@CurrentUser('sub') userId: number) {
    return this.notifications.markAllRead(userId);
  }

  @Patch(':id/read')
  read(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.markRead(userId, id);
  }

  // Delete all of the current user's notifications (legacy Notifications::delete_all).
  // Declared before the :id route so the literal path wins the match.
  @Delete()
  removeAll(@CurrentUser('sub') userId: number) {
    return this.notifications.removeAll(userId);
  }

  // Delete one notification owned by the current user (legacy Notifications::delete).
  @Delete(':id')
  remove(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.remove(userId, id);
  }
}
