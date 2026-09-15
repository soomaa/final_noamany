import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { BroadcastDto, RegisterTokenDto } from './dto/push.dto';
import { PushService } from './push.service';

@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Store/refresh the caller's mobile push token. */
  @Post('register')
  register(@Body() dto: RegisterTokenDto, @CurrentUser() user: JwtUser) {
    return this.push.register(user.sub, dto.token);
  }

  /** Clear the caller's push token (logout / opt-out). */
  @Post('unregister')
  unregister(@CurrentUser() user: JwtUser) {
    return this.push.unregister(user.sub);
  }

  /** Admin compose → broadcast to all users or a single branch. */
  @Post('broadcast')
  @RequiresPermission('admin:configure')
  broadcast(@Body() dto: BroadcastDto, @CurrentUser() user: JwtUser) {
    return this.push.broadcast(
      { title: dto.title, body: dto.body, branchId: dto.branchId },
      user.sub,
    );
  }
}
