import { lazy } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';
const ClubSubscriptionsPage = lazy(() => import('./subscriptions').then(module => ({ default: module.ClubSubscriptionsPage })));
export function MembershipAddPage({ form = false }: { form?: boolean }) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const navigate = useNavigate();
  if (!can('club.membership_add:view') || (form && !can('club.membership_add:create'))) return <p role="alert">{ui('ليس لديك صلاحية لفتح هذه الصفحة')}</p>;
  if (form) return <ClubSubscriptionsPage createOnly isolated />;
  return <div className="space-y-6"><PageHeader title={ui('إضافة ممبرشيب فقط')} actions={
    <Button permissionAction={null} className="min-h-11 gap-2" variant="brand" disabled={!can('club.membership_add:create')} onClick={() => navigate('/club/membership-add/new')}><Plus className="size-4" aria-hidden="true" />{ui('إضافة ممبرشيب')}</Button>
  } /></div>;
}
