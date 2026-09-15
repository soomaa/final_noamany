import { Module } from '@nestjs/common';
import { RbacAdminController } from './rbac-admin.controller';
import { RbacCatalogService } from './catalog.service';
import { RbacRolesService } from './roles.service';
import { RbacAuditService } from './audit.service';
import { RbacUsersController } from './rbac-users.controller';
import { RbacUsersService } from './rbac-users.service';

/**
 * Admin-facing RBAC management (roles, matrices, user roles & exceptions, audit).
 * The permission engine itself lives in the (global) RbacModule.
 */
@Module({
  controllers: [RbacAdminController, RbacUsersController],
  providers: [RbacCatalogService, RbacRolesService, RbacUsersService, RbacAuditService],
  exports: [RbacCatalogService, RbacRolesService, RbacUsersService],
})
export class RbacAdminModule {}
