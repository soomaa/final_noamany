import { Link } from 'react-router-dom';
import { Wallet, Users, Star, Search } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/page-header';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { FITNESS_ROUTES } from '@/lib/fitness-routes';

const LINKS = [
  { to: FITNESS_ROUTES.trainers.list, icon: Users, titleKey: 'trainers.title', descKey: 'trainers.title' },
  { to: FITNESS_ROUTES.trainers.payments, icon: Wallet, titleKey: 'trainerPayments.title', descKey: 'trainerSettings.desc' },
  { to: FITNESS_ROUTES.trainers.search, icon: Search, titleKey: 'trainerSearch.title', descKey: 'trainerSearch.details' },
  { to: FITNESS_ROUTES.trainers.ratings, icon: Star, titleKey: 'trainerRatings.title', descKey: 'trainers.rating' },
] as const;

export function FitnessTrainerSettingsPage() {
  const ft = useFitnessT();

  return (
    <div className="space-y-6">
      <PageHeader title={ft('trainerSettings.title')} description={ft('trainerSettings.desc')} />
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
