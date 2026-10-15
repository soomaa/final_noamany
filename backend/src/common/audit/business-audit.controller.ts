import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequiresPermission } from '../decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { BusinessAuditService } from './business-audit.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtUser } from '../types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('business-audit')
@RequiresPermission('admin.business-audit:view')
export class BusinessAuditController {
  constructor(private readonly audit: BusinessAuditService) {}

  @Get()
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('branchId') branchId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.audit.list({
      entityType,
      entityId,
      action,
      branchId: branchId ? Number(branchId) : undefined,
      actorUserId: actorUserId ? Number(actorUserId) : undefined,
      dateFrom,
      dateTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }, user);
  }
}
