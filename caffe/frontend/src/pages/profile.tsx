import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FieldWrapper } from '@/components/common/form-fields';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useMutationWithToast } from '@/lib/api-hooks';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const schema = z
  .object({
    currentPassword: z.string().min(1, uiStatic('كلمة المرور الحالية مطلوبة')),
    newPassword: z.string().min(6, uiStatic('كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل')),
    confirmPassword: z.string().min(1, uiStatic('تأكيد كلمة المرور مطلوب')),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: uiStatic('كلمتا المرور غير متطابقتين'),
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const { ui } = useLocale();
  const { user } = useAuth();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const changePassword = useMutationWithToast(
    (values: FormValues) =>
      api.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    {
      success: ui('تم تغيير كلمة المرور بنجاح'),
      onSuccess: () => reset(),
    },
  );

  const onSubmit = (values: FormValues) => changePassword.mutate(values);

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('الملف الشخصي')}
        description={user?.name ? `${ui('مرحباً،')} ${user.name}` : ui('إدارة حسابك الشخصي')}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-5 text-primary" /> {ui('تغيير كلمة المرور')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-md space-y-5">
            <FieldWrapper label={ui('كلمة المرور الحالية')} error={errors.currentPassword?.message} required>
              <div className="relative">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pe-9"
                  {...register('currentPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((s) => !s)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showCurrent ? ui('إخفاء') : ui('إظهار')}
                >
                  {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </FieldWrapper>

            <FieldWrapper label={ui('كلمة المرور الجديدة')} error={errors.newPassword?.message} required>
              <div className="relative">
                <Input
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pe-9"
                  {...register('newPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showNew ? ui('إخفاء') : ui('إظهار')}
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </FieldWrapper>

            <FieldWrapper label={ui('تأكيد كلمة المرور الجديدة')} error={errors.confirmPassword?.message} required>
              <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
            </FieldWrapper>

            <Button type="submit" variant="brand" disabled={isSubmitting || changePassword.isPending}>
              {(isSubmitting || changePassword.isPending) && <Loader2 className="size-4 animate-spin" />}
              {ui('حفظ كلمة المرور')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
