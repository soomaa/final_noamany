export interface SubscriptionActionAccess {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canPrint: boolean;
}

/** Mirrors the API's alternative update permissions for renewal mutations. */
export function canConfirmSubscriptionRenewal(
  can: (permission: string) => boolean,
): boolean {
  return (
    can('club.subscriptions.list:update') ||
    can('club.reception:update')
  );
}

/** Keeps UI actions aligned with the alternative permissions accepted by the API. */
export function subscriptionActionAccess(
  can: (permission: string) => boolean,
): SubscriptionActionAccess {
  return {
    canCreate:
      can('club.subscriptions.list:create') ||
      can('club.subscriptions.new:create') ||
      can('club.reception:create'),
    canUpdate: canConfirmSubscriptionRenewal(can),
    canDelete:
      can('club.subscriptions.list:delete') ||
      can('club.reception:delete'),
    canPrint:
      can('club.subscriptions.list:print') ||
      can('club.reception:print'),
  };
}
