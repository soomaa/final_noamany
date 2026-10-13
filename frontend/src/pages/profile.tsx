import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, BriefcaseBusiness, Building2, Camera, Eye, EyeOff, KeyRound, LayoutGrid, Loader2, ShieldCheck, UserRound } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FieldWrapper } from '@/components/common/form-fields';
import { PageHeader } from '@/components/common/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useMyPermissions, useNav } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast } from '@/lib/api-hooks';
import { uiStatic } from '@/lib/ui-static';
import { userAvatarUrl } from '@/components/employees/use-uploads';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { initials } from '@/lib/utils';
import { toast } from 'sonner';

const schema = z.object({
  currentPassword: z.string().min(1, uiStatic('كلمة المرور الحالية مطلوبة')),
  newPassword: z.string().min(6, uiStatic('كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل')),
  confirmPassword: z.string().min(1, uiStatic('تأكيد كلمة المرور مطلوب')),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: uiStatic('كلمتا المرور غير متطابقتين'), path: ['confirmPassword'],
});

type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const { ui, locale } = useLocale();
  const { user, bootstrap } = useAuth();
  const { data: permissions } = useMyPermissions();
  const { data: navigation } = useNav();
  const photoInput = useRef<HTMLInputElement>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const accessiblePages = useMemo(() => {
    const pages: Array<{ key: string; title: string; route: string }> = [];
    const walk = (nodes: NonNullable<typeof navigation>) => {
      for (const node of nodes) {
        if (node.clickable && node.route) pages.push({ key: node.key, title: node.nameAr, route: node.route });
        if (node.children.length) walk(node.children);
      }
    };
    if (navigation) walk(navigation);
    return pages.slice(0, 8);
  }, [navigation]);

  const subscriptionRouteResource = useMemo(() => Object.entries(permissions?.routeMap ?? {})
    .filter(([route]) => '/club/subscriptions/new' === route || '/club/subscriptions/new'.startsWith(`${route}/`))
    .sort(([a], [b]) => b.length - a.length)[0]?.[1], [permissions?.routeMap]);
  const canCreateSubscription = !!permissions && (permissions.superAdmin || (
    !!subscriptionRouteResource &&
    permissions.keys.includes(`${subscriptionRouteResource}:view`) &&
    ['club.subscriptions:create', 'club.subscriptions.list:create', 'club.subscriptions.new:create'].some((key) => permissions.keys.includes(key))
  ));

  const changePassword = useMutationWithToast(
    (values: FormValues) => api.post('/auth/change-password', values),
    { success: ui('تم تغيير كلمة المرور بنجاح'), onSuccess: () => reset() },
  );

  const onPhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      await api.post('/auth/profile-image', body);
      await bootstrap();
      toast.success(ui('تم تحديث الصورة الشخصية'));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setPhotoUploading(false);
    }
  };

  const avatarSrc = userAvatarUrl(user?.image);
  const permissionCount = permissions?.superAdmin ? ui('وصول كامل للنظام') : ui(`${permissions?.keys.length ?? 0} صلاحية تشغيلية`);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={ui('الملف الشخصي')} description={user?.name ? `${ui('مرحباً،')} ${user.name}` : ui('بيانات حسابك ومساحة العمل المتاحة لك')} />

      <Card className="overflow-hidden border-primary/15">
        <div className="h-28 bg-brand-gradient opacity-95" />
        <CardContent className="relative grid gap-6 px-6 pb-6 md:grid-cols-[auto_1fr_auto] md:items-end">
          <div className="relative -mt-14">
            <Avatar className="size-28 border-4 border-background shadow-lg">
              {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
              <AvatarFallback className="text-2xl">{initials(user?.name, locale)}</AvatarFallback>
            </Avatar>
            <input ref={photoInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoSelected} />
            <Button type="button" size="icon" variant="brand" className="absolute bottom-0 end-0 rounded-full shadow-md" disabled={photoUploading} onClick={() => photoInput.current?.click()} aria-label={ui('تغيير الصورة الشخصية')}>
              {photoUploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            </Button>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold">{user?.name ?? ui('المستخدم')}</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><BriefcaseBusiness className="size-4 text-primary" />{user?.job_title || ui('موظف')}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="size-4 text-primary" />{user?.branch_name || ui('فرع غير محدد')}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" />{permissions?.superAdmin ? ui('مدير النظام') : ui('صلاحيات حسابك')}</p>
            <p className="mt-1 text-muted-foreground">{permissionCount}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><LayoutGrid className="size-5 text-primary" />{ui('مساحة العمل المتاحة')}</CardTitle></CardHeader>
          <CardContent>
            {canCreateSubscription && (
              <Link to="/club/subscriptions/new" className="mb-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
                <span><span className="block font-semibold">{ui('إضافة اشتراك جديد')}</span><span className="mt-1 block text-xs text-muted-foreground">{ui('لديك صلاحية إنشاء اشتراكات')}</span></span>
                <BadgeCheck className="size-5 text-primary" />
              </Link>
            )}
            {accessiblePages.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {accessiblePages.map((page) => (
                  <Link key={page.key} to={page.route} className="rounded-xl border p-4 transition-colors hover:border-primary/35 hover:bg-primary/5">
                    <span className="block font-semibold">{ui(page.title)}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{page.route}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{ui('لا توجد صفحات عمل إضافية مرتبطة بحسابك.')}</p>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-5 text-primary" />{ui('بيانات الحساب')}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{ui('اسم المستخدم')}</span><span className="font-medium">{user?.name ?? '—'}</span></div>
              <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{ui('المسمى الوظيفي')}</span><span className="font-medium">{user?.job_title || ui('موظف')}</span></div>
              <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{ui('الفرع')}</span><span className="font-medium">{user?.branch_name || ui('غير محدد')}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-5 text-primary" />{ui('تغيير كلمة المرور')}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit((values) => changePassword.mutate(values))} className="space-y-4">
                <FieldWrapper label={ui('كلمة المرور الحالية')} error={errors.currentPassword?.message} required><div className="relative"><Input type={showCurrent ? 'text' : 'password'} autoComplete="current-password" className="pe-9" {...register('currentPassword')} /><button type="button" onClick={() => setShowCurrent((s) => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showCurrent ? ui('إخفاء') : ui('إظهار')}>{showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></FieldWrapper>
                <FieldWrapper label={ui('كلمة المرور الجديدة')} error={errors.newPassword?.message} required><div className="relative"><Input type={showNew ? 'text' : 'password'} autoComplete="new-password" className="pe-9" {...register('newPassword')} /><button type="button" onClick={() => setShowNew((s) => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showNew ? ui('إخفاء') : ui('إظهار')}>{showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></FieldWrapper>
                <FieldWrapper label={ui('تأكيد كلمة المرور الجديدة')} error={errors.confirmPassword?.message} required><Input type="password" autoComplete="new-password" {...register('confirmPassword')} /></FieldWrapper>
                <Button type="submit" variant="brand" className="w-full" disabled={isSubmitting || changePassword.isPending}>{(isSubmitting || changePassword.isPending) && <Loader2 className="size-4 animate-spin" />}{ui('حفظ كلمة المرور')}</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
