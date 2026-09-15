import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';

@UseGuards(JwtAuthGuard)
@Controller('users')
@RequiresPermission('admin.users:view')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  // Mutations must require the matching create/update/delete permission — the class-level
  // `:view` alone let anyone who could SEE users also create and delete them (privilege gap).
  @Post()
  @RequiresPermission('admin.users:create')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('admin.users:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('admin.users:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.users.remove(id);
  }

  // Toggle active/inactive (legacy status_user_type flips approved 1<->0).
  @Patch(':id/approved')
  @RequiresPermission('admin.users:update')
  toggleApproved(@Param('id', ParseIntPipe) id: number) {
    return this.users.toggleApproved(id);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.users.getPermissions(id);
  }

  @Put(':id/permissions')
  @RequiresPermission('admin.users:update')
  putPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { permissions?: string[]; scope?: { branchId?: number; gender?: 'male' | 'female' } },
    @CurrentUser() user: JwtUser,
  ) {
    assertSystemAdmin(user);
    return this.users.putPermissions(id, body);
  }
}
