import { NAV_SECTIONS } from './nav';

const trainerGroup = NAV_SECTIONS
  .find((section) => section.id === 'club')
  ?.groups?.find((group) => group.id === 'club-fitness-trainers');
const analysisGroup = NAV_SECTIONS
  .find((section) => section.id === 'club')
  ?.groups?.find((group) => group.id === 'club-fitness-analysis');

const routes = trainerGroup?.items.map((item) => item.to) ?? [];
const requiredRoutes = [
  '/club/fitness/trainers',
  '/club/fitness/trainer-payments',
  '/club/fitness/trainer-search',
  '/club/fitness/trainer-ratings',
  '/club/fitness/trainer-settings',
  '/club/fitness/trainer-targets',
  '/club/fitness/trainer-evaluations',
  '/club/fitness/trainer-evaluation-criteria',
];
const expectedAnalysisRoutes = [
  '/club/fitness/branch-analysis',
  '/club/fitness/reception-analysis',
  '/club/fitness/shift-analysis',
];

if (JSON.stringify(routes) !== JSON.stringify(requiredRoutes)) {
  throw new Error(`Trainer navigation must contain trainer-only pages. Received: ${routes.join(', ')}`);
}
if (JSON.stringify(analysisGroup?.items.map((item) => item.to) ?? []) !== JSON.stringify(expectedAnalysisRoutes)) {
  throw new Error('Gym analysis navigation must contain branch, reception, and shift analysis pages.');
}
