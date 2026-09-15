import { NAV_SECTIONS } from './nav';

const barcodeManagement = NAV_SECTIONS
  .find((section) => section.id === 'club')
  ?.groups?.find((group) => group.id === 'club-barcode-management');

const routes = barcodeManagement?.items.map((item) => item.to) ?? [];
const expectedRoutes = [
  '/club/members/barcode-management/member-check-in',
  '/club/members/barcode-management/spa-check-in',
  '/club/members/barcode-management/classes-check-in',
  '/club/members/barcode-management',
  '/club/members/barcode-management/print-range',
  '/club/members/barcode-management/spa-attendance',
  '/club/members/barcode-management/classes-attendance',
];

if (JSON.stringify(routes) !== JSON.stringify(expectedRoutes)) {
  throw new Error(
    `Barcode management navigation must preserve every sidebar route. Received: ${routes.join(', ')}`,
  );
}
