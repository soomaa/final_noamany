export type TriState = 'inherit' | 'allow' | 'deny';
export type Effect = 'allow' | 'deny';

export interface RbacAction {
  key: string;
  labelAr: string;
  labelEn: string;
  sensitive: boolean;
  sortOrder: number;
}

export interface RbacNode {
  key: string;
  type: 'module' | 'group' | 'page';
  nameAr: string;
  nameEn: string | null;
  route: string | null;
  icon: string | null;
  sortOrder: number;
  actions: string[];
  children: RbacNode[];
}

export interface RbacCatalog {
  actions: RbacAction[];
  tree: RbacNode[];
}

export interface RbacRole {
  id: number;
  key: string;
  nameAr: string;
  nameEn: string | null;
  description: string | null;
  isSystem: boolean;
  isSuperAdmin: boolean;
  users: number;
}

export interface RolesResponse {
  totalSlots: number;
  roles: RbacRole[];
}

/** A resolved cell as returned by the role-matrix endpoint. */
export interface RoleCellState {
  resourceKey: string;
  actionKey: string;
  explicit: Effect | null;
  effective: Effect;
  inheritedFrom: string | null;
}

export interface RoleMatrixResponse {
  role: RbacRole;
  superAdmin: boolean;
  cells: RoleCellState[];
  stats: { granted: number; notGranted: number; users: number };
}

/** A resolved cell as returned by the user-exceptions endpoint. */
export interface ExceptionCellState {
  resourceKey: string;
  actionKey: string;
  explicit: Effect | null;
  roleEffective: Effect;
  effective: Effect;
  inheritedFrom: string | null;
}

export interface ExceptionsResponse {
  user: { userId: number; username: string | null; name: string | null };
  roles: { id: number; nameAr: string; isSuperAdmin: boolean }[];
  superAdmin: boolean;
  cells: ExceptionCellState[];
  stats: { additionalAllows: number; explicitDenies: number; inheritedFromRoles: number };
}

export interface MatrixChange {
  resourceKey: string;
  actionKey: string;
  state: TriState;
}

export interface RbacUserListItem {
  userId: number;
  username: string | null;
  name: string | null;
  level: number | null;
  roles: { name: string; superAdmin: boolean }[];
}

export interface UserRolesResponse {
  user: { userId: number; username: string | null; name: string | null; level: number | null };
  roles: { id: number; nameAr: string; isSuperAdmin: boolean; assigned: boolean; expiresAt: string | null }[];
}

export interface AuditEntry {
  id: number;
  action: string;
  actorUserId: number | null;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  createdAt: string;
}
