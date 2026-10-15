import { uiStatic } from '@/lib/ui-static';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import type {
  AuditEntry,
  ExceptionsResponse,
  MatrixChange,
  RbacCatalog,
  RbacUserListItem,
  RoleMatrixResponse,
  RolesResponse,
  UserRolesResponse,
} from '@/types/rbac';

const keys = {
  catalog: ['rbac', 'catalog'] as const,
  roles: ['rbac', 'roles'] as const,
  roleMatrix: (id: number) => ['rbac', 'role-matrix', id] as const,
  roleUsers: (id: number) => ['rbac', 'role-users', id] as const,
  users: (search: string) => ['rbac', 'users', search] as const,
  userRoles: (id: number) => ['rbac', 'user-roles', id] as const,
  exceptions: (id: number) => ['rbac', 'exceptions', id] as const,
  audit: (skip: number) => ['rbac', 'audit', skip] as const,
};

const currentSessionQueries = ['me'] as const;

export function useCatalog() {
  return useQuery({
    queryKey: keys.catalog,
    queryFn: async () => (await api.get<RbacCatalog>('/rbac/catalog')).data,
    staleTime: 5 * 60_000,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: keys.roles,
    queryFn: async () => (await api.get<RolesResponse>('/rbac/roles')).data,
  });
}

export function useRoleMatrix(roleId: number | null) {
  return useQuery({
    queryKey: keys.roleMatrix(roleId ?? 0),
    queryFn: async () => (await api.get<RoleMatrixResponse>(`/rbac/roles/${roleId}/matrix`)).data,
    enabled: roleId != null,
  });
}

export function useRoleUsers(roleId: number | null) {
  return useQuery({
    queryKey: keys.roleUsers(roleId ?? 0),
    queryFn: async () =>
      (await api.get<{ userId: number; username: string | null; name: string | null; expiresAt: string | null }[]>(
        `/rbac/roles/${roleId}/users`,
      )).data,
    enabled: roleId != null,
  });
}

function toastMutation<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  opts: { success?: string; invalidate?: readonly (readonly unknown[])[]; onSuccess?: (data: unknown) => void },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (opts.success) toast.success(opts.success);
      opts.invalidate?.forEach((k) => void qc.invalidateQueries({ queryKey: [...k] }));
      opts.onSuccess?.(data);
    },
    onError: (e) => toast.error(apiError(e)),
  });
}

export function useSaveRoleMatrix(roleId: number) {
  return toastMutation((changes: MatrixChange[]) => api.put(`/rbac/roles/${roleId}/matrix`, { changes }), {
    success: uiStatic('تم حفظ صلاحيات الدور'),
    invalidate: [keys.roleMatrix(roleId), keys.roles, currentSessionQueries],
  });
}

export function useCreateRole() {
  return toastMutation(
    (body: { nameAr: string; nameEn?: string; description?: string }) => api.post('/rbac/roles', body),
    { success: uiStatic('تم إنشاء الدور'), invalidate: [keys.roles] },
  );
}

export function useUpdateRole() {
  return toastMutation(
    ({ id, ...body }: { id: number; nameAr?: string; nameEn?: string; description?: string }) =>
      api.patch(`/rbac/roles/${id}`, body),
    { success: uiStatic('تم تحديث الدور'), invalidate: [keys.roles] },
  );
}

export function useCloneRole() {
  return toastMutation(
    ({ id, nameAr }: { id: number; nameAr: string }) => api.post(`/rbac/roles/${id}/clone`, { nameAr }),
    { success: uiStatic('تم نسخ الدور'), invalidate: [keys.roles] },
  );
}

export function useDeleteRole() {
  return toastMutation((id: number) => api.delete(`/rbac/roles/${id}`), {
    success: uiStatic('تم حذف الدور'),
    invalidate: [keys.roles],
  });
}

// ---- users / exceptions ----------------------------------------------------------------

export function useRbacUsers(search: string) {
  return useQuery({
    queryKey: keys.users(search),
    queryFn: async () =>
      (await api.get<RbacUserListItem[]>('/rbac/users', { params: search ? { search } : {} })).data,
  });
}

export function useUserRoles(userId: number | null) {
  return useQuery({
    queryKey: keys.userRoles(userId ?? 0),
    queryFn: async () => (await api.get<UserRolesResponse>(`/rbac/users/${userId}/roles`)).data,
    enabled: userId != null,
  });
}

export function useSetUserRoles(userId: number) {
  return toastMutation((roleIds: number[]) => api.put(`/rbac/users/${userId}/roles`, { roleIds }), {
    success: uiStatic('تم تحديث أدوار المستخدم'),
    invalidate: [keys.userRoles(userId), keys.exceptions(userId), currentSessionQueries],
  });
}

export function useUserExceptions(userId: number | null) {
  return useQuery({
    queryKey: keys.exceptions(userId ?? 0),
    queryFn: async () => (await api.get<ExceptionsResponse>(`/rbac/users/${userId}/exceptions`)).data,
    enabled: userId != null,
  });
}

export function useSaveExceptions(userId: number) {
  return toastMutation((changes: MatrixChange[]) => api.put(`/rbac/users/${userId}/exceptions`, { changes }), {
    success: uiStatic('تم حفظ الاستثناءات'),
    invalidate: [keys.exceptions(userId), currentSessionQueries],
  });
}

export function useClearExceptions(userId: number) {
  return toastMutation<void>(() => api.delete(`/rbac/users/${userId}/exceptions`), {
    success: uiStatic('تم مسح كل الاستثناءات'),
    invalidate: [keys.exceptions(userId), currentSessionQueries],
  });
}

export function useAudit(skip = 0, take = 50) {
  return useQuery({
    queryKey: keys.audit(skip),
    queryFn: async () =>
      (await api.get<{ rows: AuditEntry[]; total: number }>('/rbac/audit', { params: { skip, take } })).data,
  });
}
