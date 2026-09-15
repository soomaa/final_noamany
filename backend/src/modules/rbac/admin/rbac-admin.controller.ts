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
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacAuditService } from './audit.service';
import { RbacCatalogService } from './catalog.service';
import { RbacRolesService } from './roles.service';
import {
  CloneRoleDto,
  CreateRoleDto,
  SaveMatrixDto,
  UpdateRoleDto,
} from './dto/role.dto';

@UseGuards(JwtAuthGuard)
@Controller('rbac')
export class RbacAdminController {
  constructor(
    private readonly catalog: RbacCatalogService,
    private readonly roles: RbacRolesService,
    private readonly audit: RbacAuditService,
  ) {}

  /** Resource tree + action columns for the permission matrix. */
  @Get('catalog')
  @RequiresPermission('admin.roles:view', 'admin.exceptions:view')
  getCatalog() {
    return this.catalog.getCatalog();
  }

  // ---- roles --------------------------------------------------------------------------

  @Get('roles')
  @RequiresPermission('admin.roles:view')
  listRoles() {
    return this.roles.list();
  }

  @Post('roles')
  @RequiresPermission('admin.roles:manage')
  createRole(@Body() dto: CreateRoleDto, @CurrentUser('sub') actor: number) {
    return this.roles.create(dto, actor);
  }

  @Patch('roles/:id')
  @RequiresPermission('admin.roles:manage')
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser('sub') actor: number,
  ) {
    return this.roles.update(id, dto, actor);
  }

  @Post('roles/:id/clone')
  @RequiresPermission('admin.roles:manage')
  cloneRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloneRoleDto,
    @CurrentUser('sub') actor: number,
  ) {
    return this.roles.clone(id, dto, actor);
  }

  @Delete('roles/:id')
  @RequiresPermission('admin.roles:manage')
  removeRole(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') actor: number) {
    return this.roles.remove(id, actor);
  }

  @Get('roles/:id/users')
  @RequiresPermission('admin.roles:view')
  roleUsers(@Param('id', ParseIntPipe) id: number) {
    return this.roles.users(id);
  }

  @Get('roles/:id/matrix')
  @RequiresPermission('admin.roles:view')
  getMatrix(@Param('id', ParseIntPipe) id: number) {
    return this.roles.getMatrix(id);
  }

  @Put('roles/:id/matrix')
  @RequiresPermission('admin.roles:manage')
  saveMatrix(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveMatrixDto,
    @CurrentUser('sub') actor: number,
  ) {
    return this.roles.saveMatrix(id, dto, actor);
  }

  // ---- audit --------------------------------------------------------------------------

  @Get('audit')
  @RequiresPermission('admin.audit:view')
  listAudit(@Query('skip') skip = '0', @Query('take') take = '50') {
    const s = Math.max(0, parseInt(skip, 10) || 0);
    const t = Math.min(200, Math.max(1, parseInt(take, 10) || 50));
    return this.audit.list(s, t);
  }
}
