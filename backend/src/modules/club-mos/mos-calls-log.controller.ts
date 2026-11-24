import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { MosCallsLogService } from './mos-calls-log.service';

/** Read-only call tracking for `/mos/calls`; writes still go through the entity CRUD. */
@UseGuards(JwtAuthGuard)
@Controller('club-mos/calls-log')
@RequiresPermission('club.calls:view', 'club.leads:view')
export class MosCallsLogController {
  constructor(private readonly service: MosCallsLogService) {}

  @Get('reps')
  reps(@CurrentUser() user: JwtUser) {
    return this.service.reps(user as never);
  }

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user as never, query);
  }
}
