import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserAdminService } from './user-admin.service';
import {
  CreateSystemUserDto,
  RevokeUserSessionsDto,
  UpdateSystemUserDto,
  UpdateUserStatusDto,
} from './dto/user-admin.dto';

/**
 * System-user lifecycle CRUD (legacy User.php add/edit/del/status).
 *
 * NOTE: the existing UsersController (@Controller('users')) already owns the
 * read endpoints (GET /users, GET/PUT /users/:id/permissions) *and* its own
 * write handlers. To stay create-only and collision-free at the Nest router,
 * this admin controller is mounted under `users/admin` — every route below is
 * unique and reachable. The manage screen reads the existing GET /users and
 * writes through these endpoints.
 */
@UseGuards(JwtAuthGuard)
@Controller('users/admin')
export class UserAdminController {
  constructor(private readonly userAdmin: UserAdminService) {}

  @Post()
  @RequiresPermission('admin.users:create')
  create(@Body() dto: CreateSystemUserDto, @CurrentUser('sub') actor: number) {
    return this.userAdmin.create(dto, actor);
  }

  @Patch(':id')
  @RequiresPermission('admin.users:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSystemUserDto, @CurrentUser('sub') actor: number) {
    return this.userAdmin.update(id, dto, actor);
  }

  @Delete(':id')
  @RequiresPermission('admin.users:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') actor: number) {
    return this.userAdmin.remove(id, actor);
  }

  @Patch(':id/status')
  @RequiresPermission('admin.users:update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserStatusDto, @CurrentUser('sub') actor: number) {
    return this.userAdmin.updateStatus(id, dto, actor);
  }

  @Post(':id/revoke-sessions')
  @RequiresPermission('admin.users:update')
  revokeSessions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevokeUserSessionsDto,
    @CurrentUser('sub') actor: number,
  ) {
    return this.userAdmin.revokeSessions(id, dto.reason, actor);
  }
}
