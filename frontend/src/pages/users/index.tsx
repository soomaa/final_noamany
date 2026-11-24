import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/use-permission';
import { AppUsersPage } from '@/pages/settings/app-users';
import { useLocale } from '@/store/locale';
import { UsersManagePage } from './manage';

/** المستخدمون: حسابات النظام (staff logins) and حسابات التطبيق (member app), as in MetaFit. */
export function UsersPage() {
  const { ui, dir } = useLocale();
  const { can } = usePermission();
  const [params, setParams] = useSearchParams();
  const staff = can('admin.users:view') || can('admin.exceptions:view');
  const app = can('app-management:view');
  const tab = params.get('tab') === 'app' && app ? 'app' : staff ? 'staff' : 'app';
  return (
    <div className="space-y-6">
      <PageHeader title={ui('المستخدمون')} description={ui('إدارة حسابات الدخول، بيانات المستخدمين وصلاحياتهم من مكان واحد.')} />
      <Tabs dir={dir} value={tab} onValueChange={(value) => setParams(value === 'app' ? { tab: 'app' } : {})}>
        <TabsList aria-label={ui('نوع الحساب')}>
          {staff && <TabsTrigger value="staff">{ui('حسابات النظام')}</TabsTrigger>}
          {app && <TabsTrigger value="app" disabled={params.has('user')}>{ui('حسابات التطبيق')}</TabsTrigger>}
        </TabsList>
        {staff && <TabsContent value="staff"><UsersManagePage /></TabsContent>}
        {app && <TabsContent value="app"><AppUsersPage embedded /></TabsContent>}
      </Tabs>
    </div>
  );
}
