import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { usePermission } from '@/hooks/use-permission';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 dark:bg-gradient-to-br dark:from-[#ED1C24] dark:to-[#F75D64] dark:text-white dark:shadow-[0_8px_20px_-8px_rgba(237,28,36,.6)] dark:hover:brightness-110',
        brand:
          'bg-brand-gradient text-white shadow-sm hover:brightness-110 hover:shadow-md',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-card hover:bg-accent hover:text-accent-foreground dark:border-[rgba(255,255,255,.12)] dark:bg-[rgba(255,255,255,.05)] dark:hover:bg-[rgba(255,255,255,.10)] dark:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-[10px] px-3 text-xs',
        lg: 'h-11 rounded-[10px] px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  permissionAction?: StandardAction | null;
  permissionResource?: string;
}

type StandardAction = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'export' | 'print' | 'audit' | 'configure' | 'execute';

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

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, permissionAction, permissionResource, ...props }, ref) => {
    const { pathname } = useLocation();
    const { can, isReady, hasError, resourceActions, resourceForRoute } = usePermission();
    const label = `${String(props['aria-label'] ?? '')} ${String(props.title ?? '')} ${nodeText(props.children)}`;
    const inferred = permissionAction === undefined ? inferAction(label) : permissionAction;
    if (inferred && (!isReady || hasError)) return null;
    const resource = permissionResource ?? resourceForRoute(pathname);
    const applicable = Boolean(inferred && resource && resourceActions[resource]?.includes(inferred));
    if (applicable && (!isReady || !can(`${resource}:${inferred}`))) return null;
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
