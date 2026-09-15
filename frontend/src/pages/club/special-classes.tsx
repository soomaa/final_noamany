import { CalendarDays, Dumbbell, GraduationCap, ListChecks } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ClassReportsPanel } from '@/components/club/class-reports-panel';
import { ClassSettingsPanel } from '@/components/club/class-settings-panel';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PrivatePackageCatalog } from '@/components/club/private-subscriptions';
import { FitnessSchedulingPage } from './fitness/scheduling';

type Section = 'classes' | 'private' | 'scheduling' | 'reports';

export function SpecialClassesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('section');
  const section: Section = raw === 'classes' || raw === 'scheduling' || raw === 'reports' ? raw : 'private';
  const setSection = (value: string) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set('section', value);
    if (value !== 'scheduling') next.delete('tab');
    return next;
  }, { replace: true });
  const addSpecialSubscription = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set('section', 'classes');
    next.set('action', 'create');
    next.delete('tab');
    return next;
  });
  const clearAction = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.delete('action');
    return next;
  }, { replace: true });

  return (
    <div className="space-y-6">
      <PageHeader title="الاشتراكات الخاصة" description="إدارة باقات حصص النادي ومدربيها وجداولها وحضورها بشكل مستقل عن الباقات العادية." />
      <Tabs value={section} onValueChange={setSection}>
        <div className="flex justify-center"><TabsList className="h-auto flex-wrap justify-center rounded-xl border bg-muted/40 p-1.5 shadow-sm">
          <TabsTrigger value="private"><Dumbbell className="me-2 size-4" /> اشتراكات برايفت</TabsTrigger>
          <TabsTrigger value="classes"><GraduationCap className="me-2 size-4" /> اشتراكات الحصص</TabsTrigger>
          <TabsTrigger value="scheduling"><CalendarDays className="me-2 size-4" /> الجدولة والحضور</TabsTrigger>
          <TabsTrigger value="reports"><ListChecks className="me-2 size-4" /> تقارير المدربين</TabsTrigger>
        </TabsList></div>
        <TabsContent value="classes"><ClassSettingsPanel autoOpenCreate={searchParams.get('action') === 'create'} onAutoOpenHandled={clearAction} /></TabsContent>
        <TabsContent value="private"><PrivatePackageCatalog /></TabsContent>
        <TabsContent value="scheduling"><FitnessSchedulingPage embedded onAddSpecialSubscription={addSpecialSubscription} /></TabsContent>
        <TabsContent value="reports"><ClassReportsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
