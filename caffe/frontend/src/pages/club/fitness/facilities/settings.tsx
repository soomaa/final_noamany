import { Link } from 'react-router-dom';
import { Building, Wrench, Sparkles, FileText, Activity } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/page-header';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { FITNESS_ROUTES } from '@/lib/fitness-routes';

const LINKS = [
  { to: FITNESS_ROUTES.facilities.list, icon: Building, titleKey: 'facilities.title', descKey: 'facilitySettings.desc' },
  { to: FITNESS_ROUTES.facilities.equipment, icon: Wrench, titleKey: 'equipment.title', descKey: 'equipment.newEquipment' },
  { to: FITNESS_ROUTES.facilities.maintenance, icon: Activity, titleKey: 'maintenance.title', descKey: 'maintenance.scheduled' },
  { to: FITNESS_ROUTES.facilities.spaServices, icon: Sparkles, titleKey: 'spaServices.title', descKey: 'spaServices.newService' },
  { to: FITNESS_ROUTES.facilities.spaInvoices, icon: FileText, titleKey: 'spaInvoices.title', descKey: 'spaInvoices.total' },
  { to: FITNESS_ROUTES.facilities.inbodyInvoices, icon: FileText, titleKey: 'inbodyInvoices.title', descKey: 'inbodyInvoices.walkIn' },
] as const;

export function FitnessFacilitySettingsPage() {
  const ft = useFitnessT();

  return (
    <div className="space-y-6">
      <PageHeader title={ft('facilitySettings.title')} description={ft('facilitySettings.desc')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ to, icon: Icon, titleKey, descKey }) => (
          <Link key={to} to={to}>
            <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle className="text-base">{ft(titleKey)}</CardTitle>
                <CardDescription>{ft(descKey)}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
