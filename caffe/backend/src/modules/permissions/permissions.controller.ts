import {
  Body,
  Controller,
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
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { ActionPermissionDto } from './dto/action-permission.dto';
import { ListPermissionsDto } from './dto/list-permissions.dto';

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

  @Post()
  create(@Body() body: CreatePermissionDto, @CurrentUser() user: JwtUser) {
    return this.permissions.create(body, user.sub, user.name ?? undefined);
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
