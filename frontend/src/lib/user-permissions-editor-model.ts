export function togglePermissionSet(current: ReadonlySet<string>, permissionId: string, enabled: boolean) {
  const next = new Set(current);
  if (enabled) next.add(permissionId);
  else next.delete(permissionId);
  return next;
}
