import { AsyncLocalStorage } from 'node:async_hooks';
import type { ContactVisibility } from './contact-visibility.service';
import { isMasked, maskPhone, maskSensitive } from './mask';

/**
 * Contact masking for Noamany (ported from Gymora / FIT90), enforced in one place rather than in
 * each mapper: a list that ships a number in full because someone forgot to call the masker is
 * exactly the leak this exists to prevent. Masking runs on the way out of every staff-facing
 * customer-data route, keyed on the field names used for a customer's number — whatever service
 * produced the row.
 *
 * Deliberately NOT masked (they need the real number server- or client-side): the member app
 * (`/member…`, `/Api/members`, `/mobile`, `/app`), auth, the WhatsApp sender and its extension
 * (`/wa-campaigns`, `/wa-reminders`, `/wa-ext`), HR/employees, the CSV backups, and the guest
 * invitation routes (`/club-reception-invitations`, `/club-staff-invitations`), whose flows
 * convert a guest into a member with the number they were given.
 */

/** Every name a customer's phone travels under in payloads, camel- and snake-case. */
export const CUSTOMER_PHONE_KEYS: ReadonlySet<string> = new Set([
  'phone',
  'memberPhone',
  'member_phone',
  'customerPhone',
  'customer_phone',
  'guardianPhone',
  'guardian_phone',
  'emergencyPhone',
  'emergency_phone',
  'guestPhone',
  'guest_phone',
  'inviteePhone',
  'invitee_phone',
]);

/**
 * Identity documents. Noamany always reads them in full (`ContactVisibility.sensitive` is true):
 * `cardNumber` is the member's barcode card there, so it is not listed at all.
 */
export const CUSTOMER_SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'nationalId',
  'national_id',
  'passportNumber',
  'passport_number',
]);

/**
 * Objects under these keys are staff, not customers: a class's trainer, a lead's sales rep, the
 * employee who logged a call. Their own `phone` is work contact data and stays readable. A
 * customer number nested inside them under a customer-specific name (`memberPhone`) is still
 * masked — only the bare `phone` is spared.
 */
const STAFF_PARENT_KEY = /^(trainers?|coach(es)?|captains?|employees?|staff|reps?|salesReps?|sales_rep|users?|createdBy|created_by_user|author|owner|assignee|specialists?|instructors?)$/i;

/**
 * Routes that list customers. Anything else (HR, payroll, settings, the member app) is untouched —
 * an employee's own phone on the HR screen is not customer data.
 */
const CUSTOMER_ROUTE_PREFIXES = [
  '/club-members',
  '/club-subscriptions',
  '/club-subscription-refunds',
  '/club-subscription-transfers',
  '/club-private-subscriptions',
  '/club-leads',
  '/club-attendance',
  '/club-lockers',
  '/club-locker-subscriptions',
  '/club-quick-services',
  '/club-receipts',
  '/club-spa-bookings',
  '/club-spa-invoices',
  '/club-spa-attendance',
  '/club-inbody-invoices',
  '/club-inbody-measurements',
  '/club-hall-bookings',
  '/club-classes',
  '/club-member-progress',
  '/club-member-groups',
  '/club-physical-assessments',
  '/club-workout-programs',
  '/club-surveys',
  '/club-points',
  '/club-discount-codes',
  '/club-dashboard',
  '/club-sales-dashboard',
  '/club-sales-reports',
  '/club-mos',
  '/club/search',
  '/club/entitlement',
  '/club/audit',
  '/customer-service',
  '/trainer-portal',
];

/**
 * Customer routes whose top-level rows are staff records, so a bare `phone` there is the staff
 * member's own (the trainers directory, the sales-rep pickers). Customer-named keys inside them
 * are still masked.
 */
const STAFF_ROW_ROUTES: RegExp[] = [
  /^\/club-mos\/calls-log\/reps/,
];

/** Strip the global `/api` prefix and the query string: `/api/club-members?x=1` → `/club-members`. */
export function normalizeRoute(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path.startsWith('/api/') ? path.slice(4) : path === '/api' ? '/' : path;
}

/** `/club-members` matches itself and `/club-members/…`, never `/club-members-archive`. */
export function isCustomerDataRoute(route: string): boolean {
  return CUSTOMER_ROUTE_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? route.startsWith(prefix) : route === prefix || route.startsWith(`${prefix}/`));
}

export function isStaffRowRoute(route: string): boolean {
  return STAFF_ROW_ROUTES.some((pattern) => pattern.test(route));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

type MaskOptions = { staffRows?: boolean };

/**
 * A copy of `value` with every customer number the caller may not read replaced by stars.
 * Dates, Buffers, Decimals and other class instances pass through untouched.
 */
export function maskContactTree<T>(
  value: T,
  vis: Pick<ContactVisibility, 'phones' | 'sensitive'>,
  options: MaskOptions = {},
): T {
  if (vis.phones && vis.sensitive) return value;
  const walk = (node: unknown, staffContext: boolean): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, staffContext));
    if (!isPlainObject(node)) return node;
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(node)) {
      if (typeof raw === 'string' || raw == null) {
        if (!vis.phones && CUSTOMER_PHONE_KEYS.has(key) && !(key === 'phone' && staffContext)) {
          out[key] = maskPhone(raw as string | null);
        } else if (!vis.sensitive && CUSTOMER_SENSITIVE_KEYS.has(key)) {
          out[key] = maskSensitive(raw as string | null);
        } else {
          out[key] = raw;
        }
        continue;
      }
      out[key] = walk(raw, STAFF_PARENT_KEY.test(key));
    }
    return out;
  };
  // On a staff-row route the top level (and a `data` page of it) is staff.
  if (options.staffRows) {
    if (Array.isArray(value)) return value.map((row) => walk(row, true)) as T;
    if (isPlainObject(value) && Array.isArray(value.data)) {
      return { ...walk({ ...value, data: undefined }, false) as object, data: value.data.map((row) => walk(row, true)) } as T;
    }
    return walk(value, true) as T;
  }
  return walk(value, false) as T;
}

/**
 * Removes masked contact values from a request body in place, so an edit form that was shown
 * `*********12` leaves the stored number alone instead of saving the stars over it.
 */
export function stripMaskedWrites(body: unknown): void {
  if (Array.isArray(body)) {
    body.forEach(stripMaskedWrites);
    return;
  }
  if (!isPlainObject(body)) return;
  for (const [key, raw] of Object.entries(body)) {
    if ((CUSTOMER_PHONE_KEYS.has(key) || CUSTOMER_SENSITIVE_KEYS.has(key)) && typeof raw === 'string' && isMasked(raw)) {
      delete body[key];
    } else if (raw && typeof raw === 'object') {
      stripMaskedWrites(raw);
    }
  }
}

/**
 * The caller's visibility for the request in flight. Set by the interceptor so code that writes
 * the response itself — Excel/CSV downloads — masks the same way JSON responses do.
 */
export const contactVisibilityStore = new AsyncLocalStorage<Pick<ContactVisibility, 'phones' | 'sensitive'>>();
