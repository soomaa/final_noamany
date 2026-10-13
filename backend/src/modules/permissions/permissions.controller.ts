import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { ActionPermissionDto } from './dto/action-permission.dto';
import { ListPermissionsDto } from './dto/list-permissions.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@UseGuards(JwtAuthGuard)
@Controller('permissions')
@RequiresPermission('leaves.permissions:view')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

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

  @Get(':id')
  details(@Param('id', ParseIntPipe) id: number) {
    return this.permissions.details(id);
  }

  @Post()
  create(@Body() body: CreatePermissionDto, @CurrentUser() user: JwtUser) {
    return this.permissions.create(body, user.sub, user.name ?? undefined);
  }

  @Put(':id')
  @RequiresPermission('leaves.permissions:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdatePermissionDto) {
    return this.permissions.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('leaves.permissions:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.permissions.remove(id);
  }

  @Post(':id/action')
  action(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ActionPermissionDto,
    @CurrentUser() user: JwtUser,
  ) {
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
