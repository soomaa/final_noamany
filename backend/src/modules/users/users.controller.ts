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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

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
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: JwtUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':id/account')
  @RequiresPermission('admin.users:update')
  updateAccount(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAccountDto, @CurrentUser() actor: JwtUser) {
    return this.users.updateAccount(id, dto, actor);
  }

  @Patch(':id')
  @RequiresPermission('admin.users:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentUser() actor: JwtUser) {
    return this.users.update(id, dto, actor);
  }

  @Delete(':id')
  @RequiresPermission('admin.users:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: JwtUser) {
    return this.users.remove(id, actor);
  }

  // Toggle active/inactive (legacy status_user_type flips approved 1<->0).
  @Patch(':id/approved')
  @RequiresPermission('admin.users:update')
  toggleApproved(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: JwtUser) {
    return this.users.toggleApproved(id, actor);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id', ParseIntPipe) id: number) {
    return this.users.getPermissions(id);
  }

}
