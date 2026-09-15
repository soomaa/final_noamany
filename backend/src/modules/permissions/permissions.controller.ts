import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { ActionPermissionDto } from './dto/action-permission.dto';
import { ListPermissionsDto } from './dto/list-permissions.dto';

@UseGuards(JwtAuthGuard)
@Controller('permissions')
@RequiresPermission('leaves.permissions:view')
export class PermissionsController {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly permissionEngine: PermissionEngineService,
  ) {}

  @Get()
  list(@Query() query: ListPermissionsDto, @CurrentUser('sub') userId: number) {
    return this.permissions.list(query, userId);
  }

  @Get('available')
  available(
    @Query('empId', ParseIntPipe) empId: number,
    @Query('eznDate') eznDate: string,
  ) {
    return this.permissions.available(empId, eznDate);
  }

  @Post()
  create(@Body() body: CreatePermissionDto, @CurrentUser() user: JwtUser) {
    return this.permissions.create(body, user.sub, user.name ?? undefined);
  }

  @Post(':id/action')
  async action(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ActionPermissionDto,
    @CurrentUser() user: JwtUser,
  ) {
    // The single multi-stage endpoint must require the same permission as the
    // equivalent single-stage /approve or /reject route it stands in for, not just
    // the controller's baseline :view — otherwise any viewer who happens to be the
    // current approval-chain recipient could approve/reject without that grant.
    const requiredAction = body.action === 'accept' ? 'approve' : 'reject';
    const allowed = await this.permissionEngine.can(user.sub, 'leaves.permissions', requiredAction);
    if (!allowed) throw new ForbiddenException('لا تملك صلاحية تنفيذ هذا الإجراء');
    return this.permissions.action(id, body, user.sub, user.name ?? undefined);
  }

  @Post(':id/approve')
  @RequiresPermission('leaves.permissions:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.permissions.approve(id, user.sub, user.name ?? undefined);
  }

  @Post(':id/reject')
  @RequiresPermission('leaves.permissions:reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.permissions.reject(id, user.sub, user.name ?? undefined);
  }
}
