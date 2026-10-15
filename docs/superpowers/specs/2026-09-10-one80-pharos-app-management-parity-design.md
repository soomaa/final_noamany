# ONE80 App Management PHAROS Parity Design

## Goal

Bring the complete PHAROS app-management experience and API contract into ONE80 while preserving ONE80 branding, branch isolation, payment-method improvements, member data, and all unrelated ONE80 functionality.

## Source of truth

The reference implementation is `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/PHAROS`. The target is the current ONE80 repository. PHAROS defines the expected app-management screens, workflows, request shapes, validation, and navigation. ONE80 remains authoritative wherever it already has a newer or gym-specific implementation, especially payment-method branch scoping, RBAC integrations, uploads, and member-app schema additions.

This is a code and schema parity operation. It does not copy database rows, member records, media files, environment variables, secrets, names, logos, or other PHAROS production data.

## Functional scope

The completed ONE80 app-management module will include:

- About-app content and media.
- Sent, accepted, attended, and rejected invitations.
- Package-backed app offers and promotion management.
- Trainer app profiles, specialties, availability days, ratings, and app visibility.
- Exercise categories and exercises.
- News and advertisements.
- Member notifications, including all-members and branch targeting and the app-user-only option.
- App payment methods with ONE80's existing branch-aware management behavior retained.

All screens must use the same routes and API paths as PHAROS so the planned ONE80 member app can consume the same contract.

## Frontend architecture

The PHAROS app-management pages will be ported into ONE80 as a coordinated module rather than overwriting the directory blindly.

- `content-pages.tsx` supplies the richer offers, trainer, category, exercise, news, and ad workflows.
- `member-notifications.tsx` supplies notification composition, targeting, confirmation, and recent-notification history.
- `app-crud.tsx` receives PHAROS's explicit `permissionResource` handling so nested controls check the page's actual resource.
- `app-shell.tsx` receives category-aware image uploads so each screen uses the backend upload policy it owns.
- `index.tsx`, lazy-page exports, router entries, route constants, and navigation expose every app-management screen.
- Existing ONE80 visual tokens, shared components, Arabic RTL behavior, English fallback, loading states, empty states, error states, and responsive layout remain the presentation system.
- Any PHAROS or SwatGym-specific user-facing wording or asset reference is replaced with ONE80-neutral terminology.

The current ONE80 payment-method page is not replaced wholesale. Its branch-scoped behavior is compared feature by feature with PHAROS and retained wherever it is newer, while missing PHAROS UX capabilities are incorporated without weakening ONE80 permissions.

## Backend architecture

ONE80 already contains most PHAROS app-management services and the member-notification data model. The backend work is therefore reconciliation, not duplication.

- Compare controller routes, permission guards, DTO validation, service methods, Prisma mappings, and upload categories against PHAROS.
- Add only missing API behavior required by the ported screens.
- Preserve ONE80's existing branch-aware payment-method methods and user scope.
- Keep notification fan-out transaction-safe and restricted to non-deleted, active members in the requested scope.
- Retain the existing response shapes used by PHAROS frontend pages so no ONE80-only frontend API fork is created.
- Add a new migration only if a required schema object is absent from the current ONE80 migrations. Existing production tables and rows are never recreated or cleared.

## Permissions and navigation

The app-management RBAC group remains the authority for these pages. Navigation and route guards will expose only resources the signed-in user can view. Create, update, and delete controls use their precise resource and action permissions. Trainer pages may use club-fitness permissions where their operational endpoint is owned by the fitness module; the UI must check the same resource enforced by that endpoint.

The member-notifications route is `/app/notifications` with `app-management.notifications:view`, `create`, and `delete` actions. Payment methods remain `/app/payment-methods` with ONE80's branch restrictions.

## Data and upload flow

Forms upload images through the category-specific uploads endpoint, receive a server URL, then submit that URL through the owning app-management endpoint. No base64 image payloads or local filesystem paths are stored in business records.

Offers continue to manage the same package promotion fields consumed by subscription and member-app APIs. Trainer app data continues to write to the operational trainer records rather than maintaining a disconnected app-only copy. Member notifications are persisted per recipient so the mobile API can read them directly.

## Error handling and safety

- Client validation blocks incomplete or inconsistent forms before submission.
- API errors use the existing ONE80 error formatter and leave the form open for recovery.
- Destructive operations require the existing confirmation flow and invalidate the relevant query only after success.
- Upload failures do not submit partially updated records.
- Branch selectors fail closed when the current user cannot manage the chosen branch.
- Missing permissions hide mutation controls without hiding data the user is allowed to view.
- Deployment contains no `.env`, database dump, or business-data replacement.

## Testing and verification

Implementation follows test-driven development in bounded slices:

- Frontend tests cover route registration, navigation presence, permission-resource wiring, promotion payloads, trainer availability payloads, notification targeting, and payment-method branch behavior.
- Backend tests cover notification targeting and fan-out, invitation integrity, DTO validation, upload-category authorization, and payment-method branch isolation.
- Prisma validation and migration reconciliation prove schema safety.
- Full frontend tests, TypeScript build, Vite production build, targeted backend tests, and the release code-only gate must pass.
- Impeccable checks cover responsive layout, Arabic RTL copy, accessibility labels, loading and error states, and absence of raw translation keys or PHAROS branding.
- The final release ZIP must contain this parity work plus the already completed barcode, scanner, subscription-action, Arabic-label, and migration-name fixes.

## Acceptance criteria

1. Every PHAROS app-management destination is reachable in ONE80 through the expected route and authorized navigation.
2. Offers, trainers, specialties, availability, exercise categories, exercises, news, ads, notifications, invitations, about content, and payment methods complete their supported workflows against ONE80 APIs.
3. ONE80 exposes the same app-facing API contract needed by the future mobile application.
4. ONE80 branding and existing branch and RBAC protections remain intact.
5. No PHAROS data, secrets, URLs, names, logos, or environment configuration enter the ONE80 release.
6. No migration deletes, truncates, replaces, or reseeds production business data.
7. Automated verification and the production release gate pass before the deployment archive is handed off.
