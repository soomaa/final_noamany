/** Thin route wrappers — one export per sidebar link. */
import { ClubMembersPage } from './members';
import { ClubSubscriptionsPage } from './subscriptions';
import { ClubLockersPage } from './lockers';
import { ClubSubscriptionRefundsPage } from './subscription-refunds';
import { SpecialClassesPage } from './special-classes';

export { ClubReceptionPage } from './reception';
export { ClubReceptionQuickServicesPage } from './reception-quick-services';
export { ClubBarcodeManagementPage } from './barcode-management';
export { ClubMemberFormPage } from './member-form';
export { ClubMemberGroupsPage } from './member-groups';
export { ClubSurveysPage } from './surveys';
export { ClubTreasuryPage } from './treasury';
export { UnifiedTreasuryPage } from './unified-treasury';
export { ClubMemberTransferPage } from './member-transfer';
export { ClubFinancialReportsPage } from './financial-reports';
export { ClubDiscountsPage } from './discounts';
export { ClubTimeBasedSubscriptionsPage } from './time-based';
export { ClubCustomerSourcesPage } from './customer-sources';
export { ClubPackageSettingsPage } from './package-settings';
export { SpecialClassesPage };

export function ClubSubscriptionsListPage() {
  return <ClubSubscriptionsPage />;
}

export function ClubLockersListPage() {
  return <ClubLockersPage />;
}

export function ClubMembersManagementPage() {
  return <ClubMembersPage singleView="members" />;
}
export function ClubMembersAttendancePage() {
  return <ClubMembersPage singleView="attendance" />;
}
export function ClubMemberFinancialPage() {
  return <ClubMembersPage singleView="financial" />;
}

export function ClubSubscriptionsNewPage() {
  return <ClubSubscriptionsPage openCreateOnMount />;
}
export function ClubSubscriptionsSpecialPage() {
  return <SpecialClassesPage />;
}
export function ClubSubscriptionsTransfersPage() {
  return <ClubSubscriptionsPage singleView="transfers" />;
}
export function ClubSubscriptionsRefundsPage() {
  return <ClubSubscriptionRefundsPage />;
}
export function ClubSubscriptionsReceiptsPage() {
  return <ClubSubscriptionsPage singleView="receipts" />;
}
export function ClubSubscriptionsExpiredPage() {
  return <ClubSubscriptionsPage singleView="reports" reportFocus="expired" />;
}
export function ClubSubscriptionsExpiringPage() {
  return <ClubSubscriptionsPage singleView="reports" reportFocus="expiring" />;
}
export function ClubSubscriptionsOutstandingPage() {
  return <ClubSubscriptionsPage singleView="reports" reportFocus="outstanding" />;
}

export function ClubLockersNewPage() {
  return <ClubLockersPage singleView="lockers" />;
}
export function ClubLockersSettingsPage() {
  return <ClubLockersPage singleView="types" />;
}

export { EventsBoard as ClubEventsBoardPage } from './events/EventsBoard';
export { EventWorkspace as ClubEventWorkspacePage } from './events/EventWorkspace';
export { EventsRegistrationsPage as ClubEventsRegistrationsListPage } from './events/EventsRegistrationsPage';
export { CheckinScreen as ClubCheckinScreenPage } from './events/CheckinScreen';
export { EventSettingsPage as ClubEventSettingsListPage } from './events/EventSettingsPage';
