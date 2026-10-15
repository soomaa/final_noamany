import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { DualDateField } from '@/components/common/form-fields';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast } from '@/lib/api-hooks';
import { toast } from 'sonner';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const schema = z
  .object({
    leaveTypeId: z.string().min(1, uiStatic('نوع الإجازة مطلوب')),
    startDate: z.string().min(1, uiStatic('تاريخ البداية مطلوب')),
    endDate: z.string().min(1, uiStatic('تاريخ النهاية مطلوب')),
    reason: z.string().optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: uiStatic('تاريخ النهاية يجب أن يكون بعد البداية'),
    path: ['endDate'],
  });

type FormValues = z.infer<typeof schema>;

export function LeaveFormPage() {
  const { ui } = useLocale();
  const navigate = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { leaveTypeId: '', startDate: '', endDate: '', reason: '' },
  });

  const createMutation = useMutationWithToast(
    (values: FormValues) =>
      api.post('/leaves', {
        leaveTypeId: Number(values.leaveTypeId),
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason,
      }),
    {
      success: ui('تم إرسال طلب الإجازة'),
      invalidate: ['leaves'],
      onSuccess: () => navigate('/leaves'),
    },
  );

  const onSubmit = async (values: FormValues) => {
    try {
      createMutation.mutate(values);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={ui('طلب إجازة جديد')}
        description={ui('تقديم طلب إجازة جديد للمراجعة والاعتماد')}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/leaves">
              <ArrowRight className="size-4" /> {ui('العودة للإجازات')}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-lg space-y-5">
            <div className="space-y-2">
              <Label>{ui('نوع الإجازة *')}</Label>
              <Controller
                control={control}
                name="leaveTypeId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={ui('اختر نوع الإجازة')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{ui('إجازة سنوية')}</SelectItem>
                      <SelectItem value="2">{ui('إجازة مرضية')}</SelectItem>
                      <SelectItem value="3">{ui('إجازة طارئة')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.leaveTypeId && <p className="text-xs text-destructive">{errors.leaveTypeId.message}</p>}
            </div>

            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <DualDateField
                  label={ui('تاريخ البداية')}
                  gregorianValue={field.value}
                  onGregorianChange={field.onChange}
                  error={errors.startDate?.message}
                  required
                />
              )}
            />

            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <DualDateField
                  label={ui('تاريخ النهاية')}
                  gregorianValue={field.value}
                  hijriValue={undefined}
                  onGregorianChange={field.onChange}
                  error={errors.endDate?.message}
                  required
                />
              )}
            />

            <div className="space-y-2">
              <Label htmlFor="reason">{ui('سبب الإجازة')}</Label>
              <Textarea id="reason" rows={3} placeholder={ui('اختياري…')} {...register('reason')} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" variant="brand" disabled={isSubmitting || createMutation.isPending}>
                {(isSubmitting || createMutation.isPending) && <Loader2 className="size-4 animate-spin" />}
                {ui('إرسال الطلب')}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to="/leaves">{ui('إلغاء')}</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
