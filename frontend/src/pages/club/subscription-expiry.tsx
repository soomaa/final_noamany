import { PageHeader } from '@/components/common/page-header';
import { SubscriptionExpiryReports, type ExpiryTab } from '@/components/club/subscription-expiry-reports';

/** إدارة الاشتراكات ← «اشتراكات على وشك الانتهاء». */
export function ClubSubscriptionExpiryPage({ initialTab = 'expiring' }: { initialTab?: ExpiryTab }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="اشتراكات على وشك الانتهاء"
        description="الاشتراكات اللي هتنتهي قريب واللي انتهت، مع فلتر الفرع ورجالي/حريمي والباقة، وتذكير العضو على واتساب."
      />
      <SubscriptionExpiryReports initialTab={initialTab} />
    </div>
  );
}
