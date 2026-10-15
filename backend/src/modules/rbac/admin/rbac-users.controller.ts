import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacUsersService } from './rbac-users.service';
import { AssignRolesDto, SaveMatrixDto } from './dto/role.dto';

@UseGuards(JwtAuthGuard)
@Controller('rbac/users')
export class RbacUsersController {
  constructor(private readonly users: RbacUsersService) {}

  /** Staff picker (search) with role badges — used by both Roles and Exceptions admins. */
  @Get()
  @RequiresPermission('admin.roles:view', 'admin.exceptions:view')
  list(@Query('search') search?: string) {
    return this.users.listUsers(search);
  }

  @Get(':id/roles')
  @RequiresPermission('admin.roles:view')
  getRoles(@Param('id', ParseIntPipe) id: number) {
    return this.users.getUserRoles(id);
  }

  @Put(':id/roles')
  @RequiresPermission('admin.roles:manage')
  setRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRolesDto,
    @CurrentUser('sub') actor: number,
  ) {
    return this.users.setUserRoles(id, dto, actor);
  }

  @Get(':id/exceptions')
  @RequiresPermission('admin.exceptions:view')
  getExceptions(@Param('id', ParseIntPipe) id: number) {
    return this.users.getExceptions(id);
  }

  @Put(':id/exceptions')
  @RequiresPermission('admin.exceptions:manage')
  setExceptions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveMatrixDto,
    @CurrentUser('sub') actor: number,
  ) {
    return this.users.setExceptions(id, dto, actor);
  }

  @Delete(':id/exceptions')
  @RequiresPermission('admin.exceptions:manage')
  clearExceptions(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') actor: number) {
    return this.users.clearExceptions(id, actor);
  }
}
