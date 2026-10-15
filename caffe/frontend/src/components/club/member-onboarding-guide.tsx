import { BadgeCheck, CreditCard, Hash, Lightbulb, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useClubT } from '@/hooks/use-club-t';

type GuideScope = 'members' | 'subscriptions';

const GUIDE_VERSION = 1;

export function useFirstVisitGuide(scope: GuideScope, userId?: number | null) {
  const storageKey = useMemo(
    () => (userId ? `one80.onboarding.${scope}.v${GUIDE_VERSION}.user-${userId}` : null),
    [scope, userId],
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    setVisible(localStorage.getItem(storageKey) !== 'done');
  }, [storageKey]);

  const dismiss = useCallback(() => {
    if (storageKey) localStorage.setItem(storageKey, 'done');
    setVisible(false);
  }, [storageKey]);

  return { visible, dismiss };
}

interface MemberOnboardingGuideProps {
  scope: GuideScope;
  onDismiss: () => void;
  onStart?: () => void;
  compact?: boolean;
}

export function MemberOnboardingGuide({
  scope,
  onDismiss,
  onStart,
  compact = false,
}: MemberOnboardingGuideProps) {
  const ct = useClubT();
  const memberSteps = [
    {
      icon: UserPlus,
      title: ct('onboarding.members.step1Title'),
      body: ct('onboarding.members.step1Body'),
    },
    {
      icon: Hash,
      title: ct('onboarding.members.step2Title'),
      body: ct('onboarding.members.step2Body'),
    },
    {
      icon: CreditCard,
      title: ct('onboarding.members.step3Title'),
      body: ct('onboarding.members.step3Body'),
    },
  ];
  const subscriptionSteps = [
    {
      icon: BadgeCheck,
      title: ct('onboarding.subscriptions.step1Title'),
      body: ct('onboarding.subscriptions.step1Body'),
    },
    {
      icon: CreditCard,
      title: ct('onboarding.subscriptions.step2Title'),
      body: ct('onboarding.subscriptions.step2Body'),
    },
    {
      icon: Hash,
      title: ct('onboarding.subscriptions.step3Title'),
      body: ct('onboarding.subscriptions.step3Body'),
    },
  ];
  const steps = scope === 'members' ? memberSteps : subscriptionSteps;

  return (
    <aside className="relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 shadow-sm sm:p-5">
      <div className="pointer-events-none absolute -end-12 -top-12 size-36 rounded-full bg-primary/10 blur-3xl" />
      <button
        type="button"
        onClick={onDismiss}
        className="absolute end-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        aria-label={ct('onboarding.dismiss')}
      >
        <X className="size-4" />
      </button>

      <div className="relative pe-8">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Lightbulb className="size-4" />
          </span>
          <div>
            <p className="font-semibold">{ct('onboarding.title')}</p>
            <p className="text-sm text-muted-foreground">
              {scope === 'members'
                ? ct('onboarding.members.description')
                : ct('onboarding.subscriptions.description')}
            </p>
          </div>
        </div>

        <ol className={`mt-4 grid gap-3 ${compact ? '' : 'lg:grid-cols-3'}`}>
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3 rounded-xl border bg-background/80 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            {ct('onboarding.gotIt')}
          </Button>
          {onStart && (
            <Button type="button" variant="brand" size="sm" onClick={onStart}>
              {scope === 'members'
                ? ct('onboarding.members.start')
                : ct('onboarding.subscriptions.start')}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
