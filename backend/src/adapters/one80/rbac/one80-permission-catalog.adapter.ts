import { Injectable } from '@nestjs/common';
import { flattenCatalog } from '../../../modules/rbac/catalog/rbac.catalog';
import {
  PermissionCatalogAdapter,
  PermissionCatalogResource,
} from '../../../ports/rbac/permission-catalog.adapter';

@Injectable()
export class One80PermissionCatalogAdapter implements PermissionCatalogAdapter {
  resources(): PermissionCatalogResource[] {
    return flattenCatalog().map((resource) => ({
      key: resource.key,
      parentKey: resource.parentKey,
      actions: [...resource.actions],
      nameAr: resource.nameAr,
      nameEn: resource.nameEn,
      route: resource.route,
      icon: resource.icon,
      type: resource.type,
    }));
  }
}
