import { Global, Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MenuService } from './menu.service';
import { WorkspaceService } from './workspace.service';
import { WorkspaceWidgetsService } from './workspace-widgets.service';
import { PermissionCacheService } from './engine/permission-cache.service';
import { PermissionEngineService } from './engine/permission-engine.service';

/**
 * Global so the app-level PermissionsGuard (registered in AppModule) and any feature
 * module can inject the permission engine without re-importing.
 */
@Global()
@Module({
  controllers: [MeController],
  providers: [MenuService, WorkspaceService, WorkspaceWidgetsService, PermissionCacheService, PermissionEngineService],
  exports: [MenuService, WorkspaceService, WorkspaceWidgetsService, PermissionCacheService, PermissionEngineService],
})
export class RbacModule {}
