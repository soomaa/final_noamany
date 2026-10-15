import { Controller, Get, Global, Inject, Module, Optional, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtUser } from '../common/types/jwt-user';
import { PermissionCacheService } from '../modules/rbac/engine/permission-cache.service';
import { PermissionEngineService } from '../modules/rbac/engine/permission-engine.service';
import {
  PERMISSION_CATALOG_ADAPTER,
  PermissionCatalogAdapter,
  PermissionCatalogResource,
  permissionKey,
} from '../ports/rbac/permission-catalog.adapter';
import { HrPermissionCatalogAdapter } from '../ports/rbac/hr-permission-catalog.adapter';

interface NavNode extends PermissionCatalogResource {
  clickable: boolean;
  children: NavNode[];
}

@UseGuards(JwtAuthGuard)
@Controller('me')
class PortableMeController {
  private readonly resources: PermissionCatalogResource[];

  constructor(
    private readonly engine: PermissionEngineService,
    @Optional() @Inject(PERMISSION_CATALOG_ADAPTER)
    catalog: PermissionCatalogAdapter = new HrPermissionCatalogAdapter(),
  ) {
    this.resources = catalog.resources();
  }

  @Get('permissions')
  async permissions(@CurrentUser('sub') userId: number) {
    const effective = await this.engine.getEffective(userId);
    const routeEntries = this.resources.flatMap((item) =>
      (item.routes ?? (item.route ? [item.route] : [])).map((route) => [route, item.key] as const),
    );
    return {
      superAdmin: effective.superAdmin,
      keys: [...effective.keys],
      routeMap: Object.fromEntries(routeEntries),
      resourceActions: Object.fromEntries(this.resources.map((item) => [item.key, item.actions])),
      scope: Object.fromEntries(effective.scope),
    };
  }

  @Get('workspace')
  async workspace(@CurrentUser('sub') userId: number) {
    const effective = await this.engine.getEffective(userId);
    const canView = (key: string) => effective.superAdmin || effective.keys.has(permissionKey(key, 'view'));
    return canView('hr') || canView('employees.list')
      ? { homeRoute: '/employees', roleHint: 'hr', widgets: ['notifications', 'quick_links'] }
      : { homeRoute: '/profile', roleHint: 'staff', widgets: ['notifications'] };
  }

  @Get('nav')
  async nav(@CurrentUser() user: JwtUser): Promise<NavNode[]> {
    const effective = await this.engine.getEffective(user.sub);
    const visible = (item: PermissionCatalogResource) => effective.superAdmin || effective.keys.has(permissionKey(item.key, 'view'));
    const build = (parentKey: string | null): NavNode[] => this.resources
      .filter((item) => item.parentKey === parentKey)
      .map((item) => ({ ...item, clickable: visible(item) && Boolean(item.route), children: build(item.key) }))
      .filter((item) => visible(item) || item.children.length > 0);
    return build(null);
  }
}

@Global()
@Module({
  controllers: [PortableMeController],
  providers: [
    PermissionCacheService,
    PermissionEngineService,
    HrPermissionCatalogAdapter,
    { provide: PERMISSION_CATALOG_ADAPTER, useExisting: HrPermissionCatalogAdapter },
  ],
  exports: [PermissionCacheService, PermissionEngineService, PERMISSION_CATALOG_ADAPTER],
})
export class PortableRbacModule {}
