# Community and News Enhancement Design

## Scope

Add a moderated member community to the existing gym backend and React administration panel, and expose member-mobile APIs. Extend the existing news feature with a required type and image upload. The Flutter/mobile client is out of scope; its integration point is the documented JSON API.

The design preserves the current NestJS + Prisma architecture, React/TanStack Query admin conventions, RBAC catalog, `am_member_notifications` notification feed, and `/uploads/app` upload category.

## Existing integration points

- Member requests use `MemberJwtAuthGuard` and `MemberJwtUser.memberId`; client-supplied member IDs are never trusted.
- Admin requests use the existing JWT and `@RequiresPermission(...)` RBAC model under `/app/*`.
- `am_member_notifications` already supplies per-member read state, unread count, an extensible `type`, and JSON `data` for deep links.
- The news admin already uses the shared `AppCrudPage`, `DataTable`, `Dialog`, `FilterBar`, and `/uploads/app` helper.
- Prisma migrations are committed SQL migrations under `backend/prisma/migrations`.

## Data model

Add Prisma enums:

- `CommunityPostCategory`: `question`, `experience`, `discussion`.
- `CommunityPostStatus`: `pending`, `approved`, `rejected`.
- `CommunityReactionType`: `like`, `love`.
- `AmNewsType`: `nutrition`, `championships`, `exercises`, `supplements`.

Add `community_posts` with an auto-increment ID; member ID; category; title; description; status defaulting to pending; nullable admin reply, reply timestamp, replying user ID, and rejection reason; timestamps; relations to `club_members`, optional replying `users` record, and reactions. Indexes cover status/category/created time, member/status/created time, and response lookups.

Add `community_reactions` with post ID, member ID, reaction type, timestamps, foreign keys to post and member, indexes for post/reaction type and member, and a unique `(post_id, member_id)` key. A member can therefore own at most one current reaction on a post.

Add non-null `news_type` to `am_news`, defaulted to `nutrition`, including a database backfill for existing rows. New and updated news requests validate the enum, while existing records remain valid and appear as nutrition.

## Backend modules and APIs

Create an isolated `CommunityModule` registered in the root module. It owns persistence, response mapping, validation DTOs, and controllers; it does not duplicate authentication, authorization, notifications, or uploads.

### Member API

Protected with the existing member guard under `/member/community`:

- `POST /posts`: creates a pending post from the JWT member identity.
- `GET /posts`: approved posts only, newest first, default page size 20 with validated pagination.
- `GET /posts/:id`: approved posts for all members; pending/rejected posts only for their owner. The response includes reaction counts and the caller's reaction.
- `POST /posts/:id/reaction`: accepts `like` or `love`. The same selection toggles off; the other selection atomically replaces it.

Responses include member display name/avatar, category, status when the caller owns the post, admin reply fields, `likesCount`, `lovedItCount`, and `userReaction`. Queries use grouped database counts rather than N+1 counting.

### Admin API

Protected by existing staff JWT and new catalog permissions under `/app/community`:

- `GET /posts`: paginated and database-filtered by category, status, and search text.
- `GET /posts/:id`: full moderation details and real reaction totals.
- `POST /posts/:id/approve`: requires a non-empty admin reply. Pending post becomes approved, reply fields are written, and a member notification is created.
- `POST /posts/:id/reject`: changes a pending post to rejected and accepts an optional rejection reason; a member notification is created.

The approve/reject mutation and its `am_member_notifications` insert share one Prisma transaction. Notification types follow the existing lowercase convention (`community_post_replied`, `community_post_rejected`), and `data` stores `{"communityPostId": <id>}` so the app can mark the notification read then open the post detail screen.

Invalid status transitions, missing resources, invalid payloads, unauthorized access, duplicate integrity errors, and inaccessible post details use the application's existing Nest exception handling.

## Administration UI

Add a Community Management page inside the existing App Management content group and route it through the same lazy-route/navigation pattern. It uses the shared table, modal, buttons, toast errors, confirmation dialog, list-query URL state, and TanStack Query invalidation.

The table shows ID, member, category, title, description, submission date, status, Like count, Love count, and actions. Server-side category/status filters, search, and pagination are passed to the API. Detail, approve-with-required-reply, and reject-with-optional-reason dialogs expose the requested data and disable action buttons while pending.

The existing News page gains a required Arabic type selector, an image upload input using `uploadAppImage`, and preview. Its table adds a type column. API and database validation remain authoritative; images stay optional for pre-existing or newly created news where business rules allow it.

## Permissions and security

Add a dedicated `app-management.community` RBAC page and action permissions to the existing catalog. No member endpoint accepts a member ID for ownership. No staff action is exposed through the member controller. Rejected and pending posts are not publicly enumerable. Reactions target only approved posts.

## Verification

Add focused service/controller tests for creation ownership, public visibility, admin moderation transactions and notification payloads, reaction toggle/swap/uniqueness, filters, and news type validation. Run Prisma validation/generation, backend build/typecheck/tests, and frontend typecheck/build. No migration is applied to a real database without the user's environment-specific migration command and database connection.
