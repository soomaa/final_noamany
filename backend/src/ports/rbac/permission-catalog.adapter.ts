export const PERMISSION_CATALOG_ADAPTER = Symbol('PERMISSION_CATALOG_ADAPTER');

export interface PermissionCatalogResource {
  key: string;
  parentKey: string | null;
  actions: string[];
  nameAr?: string;
  nameEn?: string;
  route?: string;
  /** Route aliases owned by this resource, including parameterised React routes. */
  routes?: string[];
  icon?: string;
  type?: 'module' | 'group' | 'page';
}

export interface PermissionCatalogAdapter {
  resources(): PermissionCatalogResource[];
}

export class EmptyPermissionCatalogAdapter implements PermissionCatalogAdapter {
  resources(): PermissionCatalogResource[] {
    return [];
  }
}

export const permissionKey = (resourceKey: string, action: string) =>
  `${resourceKey}:${action}`;
