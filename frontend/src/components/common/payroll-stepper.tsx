import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const PAYROLL_STEP_DEFS = [
  { id: 'compute', label: uiStatic('احتساب المرتبات'), action: 'compute' },
  { id: 'review', label: uiStatic('مراجعة المرتبات'), action: 'review' },
  { id: 'approve', label: uiStatic('اعتماد المرتبات'), action: 'approve' },
  { id: 'post', label: uiStatic('إصدار كشف المرتب'), action: 'post' },
  { id: 'bank', label: uiStatic('التحويل البنكي'), action: 'bank' },
  { id: 'print', label: uiStatic('طباعة كشف الرواتب'), action: 'print' },
] as const;

export type PayrollStepId = (typeof PAYROLL_STEP_DEFS)[number]['id'];

interface PayrollStepperProps {
  currentStep: PayrollStepId;
  onAction?: (action: string) => void;
  loading?: boolean;
  className?: string;
}

export function PayrollStepper({ currentStep, onAction, loading, className }: PayrollStepperProps) {
  const { ui } = useLocale();
  const currentIndex = PAYROLL_STEP_DEFS.findIndex((s) => s.id === currentStep);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap gap-2">
        {PAYROLL_STEP_DEFS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                active && 'border-primary bg-primary/10 text-primary font-medium',
                done && 'border-success/40 bg-success/5 text-success',
                !active && !done && 'border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="size-4" /> : <span className="nums">{i + 1}</span>}
              {ui(step.label)}
            </div>
          );
        })}
      </div>
      {onAction && PAYROLL_STEP_DEFS[currentIndex]?.action && (
        <Button
          onClick={() => {
            const action = PAYROLL_STEP_DEFS[currentIndex].action!;
            if (action === 'print') window.print();
            else onAction(action);
          }}
          disabled={loading}
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          {currentIndex === 0 && ui('بدء الاحتساب')}
          {currentIndex === 1 && ui('إرسال للاعتماد')}
          {currentIndex === 2 && ui('اعتماد المسيرة')}
          {currentIndex === 3 && ui('إصدار الكشوف')}
          {currentIndex === 4 && ui('توليد ملف التحويل البنكي')}
          {currentIndex === 5 && ui('طباعة')}
        </Button>
      )}
    </div>
  );
}

export function statusToPayrollStep(status?: string): PayrollStepId {
  const map: Record<string, PayrollStepId> = {
    draft: 'compute',
    computed: 'review',
    reviewing: 'review',
    approved: 'post',
    posted: 'bank',
    banked: 'print',
    completed: 'print',
  };
  return map[status ?? ''] ?? 'compute';
}

export const PAYROLL_STEPS = PAYROLL_STEP_DEFS;
