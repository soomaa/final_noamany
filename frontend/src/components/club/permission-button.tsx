import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Button, type ButtonProps } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';

/**
 * MetaFit's Button behaviour for the sales-management screens ported from it: a control whose
 * action the user lacks on the page's resource is not rendered at all (create/update/delete/
 * export…, inferred from its label unless `permissionAction` says otherwise). Noamany's shared
 * Button does not do this, so the ported pages import this one under the same name.
 */
type StandardAction = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'export' | 'print' | 'audit' | 'configure' | 'execute';

/** The actions each sales-management resource has in the RBAC catalog (backend rbac.catalog.ts). */
const LIST: StandardAction[] = ['create', 'update', 'delete', 'export', 'print', 'audit'];
const RESOURCE_ACTIONS: Record<string, StandardAction[]> = {
  'club.leads': LIST,
  'club.calls': ['export', 'print'],
  'club.whatsapp': ['create', 'update', 'delete', 'configure', 'audit'],
  'club.sales.dashboard': ['export', 'print', 'update'],
  'club.sales.settings': ['update', 'configure', 'audit'],
  'club.sales.reports': ['export', 'print'],
  'club.subscriptions.customer_sources': LIST,
};

function nodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

function inferAction(label: string): StandardAction | null {
  if (/رفض|reject/i.test(label)) return 'reject';
  if (/اعتماد|موافقة|approve/i.test(label)) return 'approve';
  if (/حذف|إزالة|ازالة|delete|remove/i.test(label)) return 'delete';
  if (/تصدير|export|excel/i.test(label)) return 'export';
  if (/طباعة|print/i.test(label)) return 'print';
  if (/سجل التدقيق|السجلات|audit/i.test(label)) return 'audit';
  if (/مزامنة|تنفيذ|تشغيل|فتح الدخول|فتح الخروج|ترحيل|عكس القيد|execute|sync|run/i.test(label)) return 'execute';
  if (/إعداد|اعداد|token|configure/i.test(label)) return 'configure';
  if (/إضافة|اضافة|جديد|جديدة|إنشاء|انشاء|\badd\b|\bnew\b|create/i.test(label)) return 'create';
  if (/تعديل|حفظ|\bedit\b|\bsave\b/i.test(label)) return 'update';
  return null;
}

export interface PermissionButtonProps extends ButtonProps {
  /** Explicit action wins over label inference; set null to opt out for a purely local button. */
  permissionAction?: StandardAction | null;
  /** Override the route-owned resource for controls rendered inside another page/tab. */
  permissionResource?: string;
}

export const PermissionButton = React.forwardRef<HTMLButtonElement, PermissionButtonProps>(
  ({ permissionAction, permissionResource, ...props }, ref) => {
    const { pathname } = useLocation();
    const { can, isReady, hasError, routeMap } = usePermission();
    const label = `${String(props['aria-label'] ?? '')} ${String(props.title ?? '')} ${nodeText(props.children)}`;
    const inferred = permissionAction === undefined ? inferAction(label) : permissionAction;
    // A mutation-looking control must never flash while the permission payload is
    // loading, and must remain fail-closed if that payload could not be loaded.
    if (inferred && (!isReady || hasError)) return null;
    let resource = permissionResource ?? null;
    if (!resource) {
      let best = -1;
      for (const [route, key] of Object.entries(routeMap)) {
        if ((pathname === route || pathname.startsWith(`${route}/`)) && route.length > best) {
          best = route.length;
          resource = key;
        }
      }
    }
    const applicable = Boolean(inferred && resource && RESOURCE_ACTIONS[resource]?.includes(inferred));
    if (applicable && !can(`${resource}:${inferred}`)) return null;
    return <Button ref={ref} {...props} />;
  },
);
PermissionButton.displayName = 'PermissionButton';
