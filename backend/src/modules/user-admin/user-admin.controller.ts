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
import { UserAdminService } from './user-admin.service';
import {
  CreateSystemUserDto,
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
  create(@Body() dto: CreateSystemUserDto) {
    return this.userAdmin.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('admin.users:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSystemUserDto) {
    return this.userAdmin.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('admin.users:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.userAdmin.remove(id);
  }

  @Patch(':id/status')
  @RequiresPermission('admin.users:update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserStatusDto) {
    return this.userAdmin.updateStatus(id, dto);
  }
}
