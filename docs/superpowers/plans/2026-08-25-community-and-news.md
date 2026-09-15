# Community and News Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure, moderated member community with reactions and member notifications, plus typed image-enabled news administration and member-mobile APIs.

**Architecture:** A new NestJS `CommunityModule` owns community persistence, DTO validation, staff moderation endpoints, and member endpoints. It uses the established Prisma schema, member JWT identity, admin RBAC catalog, `am_member_notifications` table, React `DataTable`/`Dialog`, TanStack Query, and `/uploads/app` rather than creating parallel systems.

**Tech Stack:** NestJS 11, Prisma 5/MySQL migrations, class-validator, Jest/ts-jest, React 18, TypeScript, TanStack Query/Table, Radix Dialog, Tailwind, Sonner.

**Spec:** `docs/superpowers/specs/2026-08-25-community-and-news-design.md`

## Global Constraints

- Preserve every existing feature and existing API response/error conventions.
- Member ownership always comes from `MemberJwtUser.memberId`; do not accept `memberId` in member request bodies.
- Reuse `am_member_notifications`, its unread/read endpoints, and JSON `data` for `communityPostId` deep links.
- Reuse `/uploads/app`, including its MIME/signature/size validation; do not build a second upload implementation.
- Community public queries return approved posts only, newest first, with a default/maximum-safe first page of 20 items.
- Filtering, sort order, pagination, reaction counts, and access control must occur in database-backed backend queries, not by fetching all records to the frontend.
- Existing `am_news` rows are assigned `nutrition`; all create/update requests require `newsType`.
- This workspace has no `.git`; each task ends in verification rather than a commit. Do not initialize or rewrite version-control state.

---

## Planned file structure

| File | Responsibility |
| --- | --- |
| `backend/prisma/schema.prisma` | Community models/enums/relations and required typed news field. |
| `backend/prisma/migrations/20260825_community_and_typed_news/migration.sql` | Non-destructive schema changes, data backfill, indexes, and FKs. |
| `backend/src/modules/community/community.module.ts` | Register controllers/service with Prisma. |
| `backend/src/modules/community/community.service.ts` | Community queries, ownership checks, moderation transaction, reactions, response mapping. |
| `backend/src/modules/community/community-member.controller.ts` | Member JWT route contract. |
| `backend/src/modules/community/community-admin.controller.ts` | Staff JWT/RBAC route contract. |
| `backend/src/modules/community/dto/community.dto.ts` | Validated member/admin/list/reaction DTOs. |
| `backend/src/modules/community/community.service.spec.ts` | Tests for service-level ownership, moderation, reactions, and list behavior. |
| `backend/src/app.module.ts` | Register `CommunityModule`. |
| `backend/src/modules/rbac/catalog/rbac.catalog.ts` | Add the Community Management page and action permission catalog entry. |
| `backend/src/modules/app-management/dto/app-management.dto.ts` | Require `newsType` and validate `AmNewsType`. |
| `backend/src/modules/app-management/app-management.service.ts` | Persist/map/filter news type. |
| `frontend/src/pages/app-management/community.tsx` | Moderation table and detail/approve/reject dialogs. |
| `frontend/src/pages/app-management/content-pages.tsx` | Typed news selector, upload/preview, and type column. |
| `frontend/src/app/lazy-pages.ts` | Lazy-load Community Management. |
| `frontend/src/app/router.tsx` | Add `/app/community` route with established permission behavior. |
| `frontend/src/lib/app-management-routes.ts` | Surface the page under App Management navigation if this route registry owns the app-management leaf map. |

### Task 1: Database contract and news type

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260825_community_and_typed_news/migration.sql`
- Test: Prisma schema/migration validation commands

**Interfaces:**
- Produces: Prisma models `community_posts`, `community_reactions`; enums `CommunityPostCategory`, `CommunityPostStatus`, `CommunityReactionType`, `AmNewsType`; `am_news.news_type`.
- Consumes: existing `club_members.id`, `users.user_id`, `am_news`, and `am_member_notifications` table conventions.

- [ ] **Step 1: Add the failing schema references and validate before implementation**

  Add a temporary compile-targeted service type reference only after confirming `npx prisma validate` currently passes. Record this baseline command:

  ```powershell
  npm run prisma:validate
  ```

  Expected: PASS before changes; this establishes that future schema errors are introduced by this feature.

- [ ] **Step 2: Define Prisma enums and models**

  Add the following semantic schema surface using existing snake_case model/column conventions:

  ```prisma
  enum CommunityPostStatus { pending approved rejected }
  enum CommunityPostCategory { question experience discussion }
  enum CommunityReactionType { like love }
  enum AmNewsType { nutrition championships exercises supplements }

  model community_posts {
    id               Int                 @id @default(autoincrement())
    member_id        Int
    category         CommunityPostCategory
    title            String              @db.VarChar(255)
    description      String              @db.Text
    status           CommunityPostStatus @default(pending)
    admin_reply      String?             @db.Text
    replied_at       DateTime?
    replied_by       Int?
    rejection_reason String?             @db.Text
    created_at       DateTime            @default(now())
    updated_at       DateTime            @updatedAt
    member           club_members        @relation(fields: [member_id], references: [id])
    replied_by_user  users?              @relation("community_post_replied_by", fields: [replied_by], references: [user_id])
    reactions        community_reactions[]
    @@index([status, category, created_at])
    @@index([member_id, status, created_at])
    @@index([replied_by])
    @@map("community_posts")
  }

  model community_reactions {
    id            Int                   @id @default(autoincrement())
    post_id       Int
    member_id     Int
    reaction_type CommunityReactionType
    created_at    DateTime              @default(now())
    updated_at    DateTime              @updatedAt
    post          community_posts       @relation(fields: [post_id], references: [id], onDelete: Cascade)
    member        club_members          @relation(fields: [member_id], references: [id])
    @@unique([post_id, member_id])
    @@index([post_id, reaction_type])
    @@index([member_id])
    @@map("community_reactions")
  }
  ```

  Add `news_type AmNewsType @default(nutrition)` to `am_news` and add any reverse relation fields that Prisma requires on existing `club_members` and `users`.

- [ ] **Step 3: Write a non-destructive SQL migration**

  Create SQL that (1) creates the enum storage dictated by the provider/current Prisma migration style, (2) adds `news_type` as non-null/default nutrition so legacy news is valid, (3) creates both community tables with FK constraints, (4) creates the named indexes and unique constraint. Never drop or rename existing columns/tables.

  The critical invariant must be visible in the migration:

  ```sql
  ALTER TABLE `am_news`
    ADD COLUMN `news_type` ENUM('nutrition','championships','exercises','supplements') NOT NULL DEFAULT 'nutrition';
  ```

  Adapt the exact quoting/enum DDL only if the project’s existing generated Prisma migrations require a different MySQL form.

- [ ] **Step 4: Generate Prisma client and verify schema**

  Run:

  ```powershell
  npm run prisma:validate
  npm run prisma:generate
  ```

  Expected: both commands exit 0 and Prisma Client exposes the four enums and the two delegates.

### Task 2: Community service with test-first behavior

**Files:**
- Create: `backend/src/modules/community/community.service.ts`
- Create: `backend/src/modules/community/community.service.spec.ts`
- Create: `backend/src/modules/community/dto/community.dto.ts`

**Interfaces:**
- Consumes: Task 1 delegates/enums, `PrismaService`, `MemberJwtUser`, and staff user ID.
- Produces: `createPost(member, dto)`, `listMemberPosts(member, query)`, `getMemberPost(member, id)`, `setReaction(member, id, dto)`, `listAdminPosts(query)`, `getAdminPost(id)`, `approvePost(id, adminId, dto)`, and `rejectPost(id, adminId, dto)`.

- [ ] **Step 1: Write failing unit tests for the service contract**

  Mock `PrismaService` and cover at least the following test names/expectations:

  ```ts
  it('creates a pending post using member.memberId, never a body memberId', async () => {
    await service.createPost(member({ memberId: 44 }), { category: 'question', title: 'T', description: 'D' });
    expect(prisma.community_posts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 44, status: 'pending' }),
    }));
  });

  it('does not expose a pending post to a different member', async () => {
    prisma.community_posts.findUnique.mockResolvedValue({ id: 7, member_id: 44, status: 'pending' });
    await expect(service.getMemberPost(member({ memberId: 99 }), 7)).rejects.toThrow(ForbiddenException);
  });

  it('toggles an identical reaction off and replaces a different reaction', async () => {
    prisma.community_reactions.findUnique.mockResolvedValueOnce({ id: 8, reaction_type: 'like' });
    await service.setReaction(member({ memberId: 44 }), 7, { reactionType: 'like' });
    expect(prisma.community_reactions.delete).toHaveBeenCalledWith({ where: { id: 8 } });
    prisma.community_reactions.findUnique.mockResolvedValueOnce({ id: 8, reaction_type: 'like' });
    await service.setReaction(member({ memberId: 44 }), 7, { reactionType: 'love' });
    expect(prisma.community_reactions.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { reaction_type: 'love' } });
  });

  it('approves with reply and inserts one deep-link notification in the same transaction', async () => {
    await service.approvePost(7, 3, { adminReply: 'الإجابة' });
    expect(tx.am_member_notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 44, type: 'community_post_replied', data: JSON.stringify({ communityPostId: 7 }) }),
    }));
  });

  it('rejects a pending post and creates a community_post_rejected notification', async () => {
    await service.rejectPost(7, 3, { rejectionReason: 'سبب المراجعة' });
    expect(tx.community_posts.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'rejected' }) }));
    expect(tx.am_member_notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 44, type: 'community_post_rejected' }),
    }));
  });
  ```

- [ ] **Step 2: Run the focused test to confirm the new service is absent/failing**

  Run:

  ```powershell
  npm test -- --runInBand src/modules/community/community.service.spec.ts
  ```

  Expected: FAIL until the module/service and DTOs exist.

- [ ] **Step 3: Define DTOs with exact validation**

  Implement the following contract with `class-validator` and existing pagination DTO patterns:

  ```ts
  class CreateCommunityPostDto {
    @IsEnum(CommunityPostCategory) category!: CommunityPostCategory;
    @IsString() @MaxLength(255) title!: string;
    @IsString() @MaxLength(10000) description!: string;
  }
  class SetCommunityReactionDto { @IsEnum(CommunityReactionType) reactionType!: CommunityReactionType; }
  class ApproveCommunityPostDto { @IsString() @MinLength(1) @MaxLength(10000) adminReply!: string; }
  class RejectCommunityPostDto { @IsOptional() @IsString() @MaxLength(10000) rejectionReason?: string; }
  ```

  Implement list DTOs with optional enum `category`/`status`, optional bounded search, and page/pageSize defaults compatible with `PaginationDto`; the member list must default `pageSize` to 20.

- [ ] **Step 4: Implement minimal database-backed service behavior**

  Implement the interfaces above with these exact branch rules: first fetch the post and require `status === 'approved'` for reactions. Query the composite reaction uniqueness key for the authenticated member. Delete an equal reaction, update a different reaction, and create when no row exists. Return a fresh mapped post response after the mutation so counts and `userReaction` are current.

  ```ts
  async setReaction(member: MemberJwtUser, postId: number, dto: SetCommunityReactionDto) {
    const current = await this.prisma.community_reactions.findUnique({
      where: { post_id_member_id: { post_id: postId, member_id: member.memberId } },
    });
    if (current?.reaction_type === dto.reactionType) await this.prisma.community_reactions.delete({ where: { id: current.id } });
    else if (current) await this.prisma.community_reactions.update({ where: { id: current.id }, data: { reaction_type: dto.reactionType } });
    else await this.prisma.community_reactions.create({ data: { post_id: postId, member_id: member.memberId, reaction_type: dto.reactionType } });
  }

  async approvePost(postId: number, adminId: number, dto: ApproveCommunityPostDto) {
    return this.prisma.$transaction(async (tx) => {
      const post = await requirePendingPost(tx, postId);
      const approved = await tx.community_posts.update({
        where: { id: postId },
        data: { status: 'approved', admin_reply: dto.adminReply.trim(), replied_at: new Date(), replied_by: adminId, rejection_reason: null },
      });
      await tx.am_member_notifications.create({
        data: { member_id: post.member_id, branch_id: post.member.branch_id, title: 'تم الرد على منشورك في المجتمع', body: 'تم الرد على منشورك المرسل إلى إدارة المجتمع. اضغط لعرض الرد.', type: 'community_post_replied', data: JSON.stringify({ communityPostId: postId }) },
      });
      return mapAdminPost(approved);
    });
  }
  ```

  Return real counts using Prisma `_count` filtered relations or one grouped aggregation per page; never loop per item. Include member name/profile image and the current member’s reaction in the response mapper. Reject transitions from non-pending posts with `BadRequestException`.

- [ ] **Step 5: Run focused tests and backend typecheck**

  Run:

  ```powershell
  npm test -- --runInBand src/modules/community/community.service.spec.ts
  npm run typecheck
  ```

  Expected: all community service tests and backend typecheck pass.

### Task 3: Route/module/RBAC integration

**Files:**
- Create: `backend/src/modules/community/community.module.ts`
- Create: `backend/src/modules/community/community-member.controller.ts`
- Create: `backend/src/modules/community/community-admin.controller.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/modules/rbac/catalog/rbac.catalog.ts`
- Test: `backend/src/modules/community/community.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 service/DTOs.
- Produces: authenticated `/member/community/*` and RBAC-protected `/app/community/*` routes and `app-management.community` permissions.

- [ ] **Step 1: Add route-level tests or controller assertions before wiring routes**

  Add tests that inspect controller delegation (or use a Nest testing module) for these exact signatures:

  ```ts
  POST /member/community/posts
  GET  /member/community/posts?page=1&pageSize=20
  GET  /member/community/posts/:id
  POST /member/community/posts/:id/reaction
  GET  /app/community/posts?status=pending&category=question&search=x
  GET  /app/community/posts/:id
  POST /app/community/posts/:id/approve
  POST /app/community/posts/:id/reject
  ```

  Assert member routes pass `@CurrentMember()` into the service and staff routes pass `@CurrentUser('sub')`; no route accepts a member ID.

- [ ] **Step 2: Implement the member controller and module**

  Match `MemberController` decorators exactly:

  ```ts
  @Public()
  @UseGuards(MemberJwtAuthGuard)
  @Controller('member/community')
  export class CommunityMemberController {
    constructor(private readonly community: CommunityService) {}
  }
  ```

  Register it, the admin controller, and the service in `CommunityModule`, import `PrismaModule`, then add `CommunityModule` to `AppModule.imports`.

- [ ] **Step 3: Implement the admin controller and RBAC catalog**

  Guard the controller with existing staff JWT. Add `@RequiresPermission('app-management.community:view')` to reads, `...:update` to approve/reject, and catalog entry:

  ```ts
  page('app-management.community', 'إدارة المجتمع', '/app/community', LIST, 'Community')
  ```

  Place it under the existing `app-management.content` group, preserving the catalog’s action inheritance.

- [ ] **Step 4: Run API/module verification**

  Run:

  ```powershell
  npm test -- --runInBand src/modules/community/community.service.spec.ts
  npm run build
  ```

  Expected: routes compile into the application and no existing module imports regress.

### Task 4: Typed news backend and reusable upload path

**Files:**
- Modify: `backend/src/modules/app-management/dto/app-management.dto.ts`
- Modify: `backend/src/modules/app-management/app-management.service.ts`
- Test: extend a focused `backend/src/modules/app-management/app-management.service.spec.ts` if absent, otherwise create it

**Interfaces:**
- Consumes: Task 1 `AmNewsType` and existing `/uploads/app` path storage.
- Produces: `newsType` in news create/update/list responses and required backend validation.

- [ ] **Step 1: Write failing news type tests**

  Cover these contracts:

  ```ts
  it('rejects news creation without newsType', async () => {
    await expect(service.createNews({ title: 'x', content: 'y' } as never)).rejects.toThrow(BadRequestException);
  });
  it('persists and maps supplements as newsType', async () => {
    await service.createNews({ title: 'x', content: 'y', newsType: 'supplements' });
    expect(prisma.am_news.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ news_type: 'supplements' }) }));
  });
  it('continues mapping imageUrl when stored image_url is null or an uploads/app path', async () => {
    expect(mapNews({ ...row, image_url: null }).imageUrl).toBeNull();
    expect(mapNews({ ...row, image_url: 'mobile_app/news.png' }).imageUrl).toContain('mobile_app/news.png');
  });
  ```

- [ ] **Step 2: Make `newsType` required in the DTO and service**

  Update `UpsertNewsDto` and mapping code:

  ```ts
  export class UpsertNewsDto {
    @IsString() title!: string;
    @IsString() content!: string;
    @IsEnum(AmNewsType) newsType!: AmNewsType;
    @IsOptional() @IsString() imageUrl?: string;
  }
  ```

  Preserve the current `publishDate` and `isPublished` validators. In create/update persistence use `news_type: dto.newsType`; in the response mapper emit `newsType: row.news_type`.

  The essential mapping is:

  ```ts
  news_type: dto.newsType
  newsType: row.news_type
  ```

  Keep image URL storage optional. Do not add a new upload endpoint/category because `POST /uploads/app` already validates images and returns the stored path/URL.

- [ ] **Step 3: Run focused tests and regenerate Prisma client**

  Run:

  ```powershell
  npm run prisma:generate
  npm test -- --runInBand src/modules/app-management/app-management.service.spec.ts
  npm run typecheck
  ```

  Expected: news type is type-safe and existing optional-image behavior remains valid.

### Task 5: Community Management and news admin UI

**Files:**
- Create: `frontend/src/pages/app-management/community.tsx`
- Modify: `frontend/src/pages/app-management/content-pages.tsx`
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/lib/app-management-routes.ts` only if the existing route lookup requires an explicit mapping
- Test: frontend TypeScript build plus browser/API smoke checklist

**Interfaces:**
- Consumes: Task 3 `/app/community` response/actions and Task 4 typed `/app/news` response/payload.
- Produces: admin route `/app/community`, server-side table filters, moderation dialogs, and typed/image news form.

- [ ] **Step 1: Add failing TypeScript-level UI expectations**

  Before adding the page, run:

  ```powershell
  npm run typecheck
  ```

  Then define exact local interfaces used by the new page so later API calls cannot use untyped data:

  ```ts
  type CommunityStatus = 'pending' | 'approved' | 'rejected';
  type CommunityCategory = 'question' | 'experience' | 'discussion';
  interface CommunityPostRow {
    id: number; member: { id: number; name: string; profilePictureUrl: string | null };
    category: CommunityCategory; title: string; description: string; status: CommunityStatus;
    adminReply: string | null; rejectionReason: string | null; repliedAt: string | null;
    likesCount: number; lovedItCount: number; createdAt: string;
  }
  ```

- [ ] **Step 2: Build Community Management page from existing UI primitives**

  Use `AppManagementShell`, `useListQuery`, `usePaginatedList`, `DataTable`, `FilterBar`, `Dialog`, `Textarea`, `confirm`, `apiError`, and `toast`. Query key/params must include `category` and `status` so changing a filter requests:

  ```ts
  api.get('/app/community/posts', { params: { page, pageSize, search, category, status } })
  ```

  Include Arabic labels for all category/status values. Render the required columns and buttons for details, approve/reply, and reject. Require a trimmed reply before calling:

  ```ts
  await api.post(`/app/community/posts/${post.id}/approve`, { adminReply: reply.trim() });
  ```

  Reject uses `confirm`, then posts the optional reason. On every successful action, close the dialog and invalidate/refetch the current list. Disable each action while its mutation is pending and show error toasts through `apiError`.

- [ ] **Step 3: Wire the route with established lazy-page style**

  Add a lazy export and a protected route at `/app/community` following the neighboring `/app/news` implementation. Do not create an independent navigation system: it must appear because the RBAC catalog/page route machinery recognizes `app-management.community`.

- [ ] **Step 4: Enhance the existing News page**

  Add `newsType: 'nutrition'` to the empty form; add a required select with values `nutrition`, `championships`, `exercises`, `supplements`; include `newsType` in `toPayload`; and add a type column. Add an image input that calls existing `uploadAppImage(file)`, stores the result in `imageUrl`, displays a preview using the URL/path resolver already used by app content pages, and allows clearing the image.

  The payload must be:

  ```ts
  { title, content, newsType: form.newsType, publishDate, isPublished, imageUrl: form.imageUrl || undefined }
  ```

- [ ] **Step 5: Verify frontend compilation and manual behavior**

  Run:

  ```powershell
  npm run typecheck
  npm run build
  ```

  Manual smoke test with a staff account: load `/app/community`, filter pending/question, search, page results, open details, approve with reply, reject another post, create/edit a news item with a selected type and uploaded image. Expected: all requests use the new backend contracts and no blank/error UI occurs.

### Task 6: End-to-end safety and release verification

**Files:**
- Modify: only files identified by failures in Tasks 1–5
- Test: repository build/lint/test commands and API workflow evidence

**Interfaces:**
- Consumes: all completed feature interfaces.
- Produces: verified migration-ready feature and final report with modified/new files and any environment blockers.

- [ ] **Step 1: Execute the member/community API scenario against a test database**

  Use two member JWTs and one staff JWT. Verify in this order: create post → pending is absent from public list → staff list/filter/detail → approve with reply → one unread notification addressed only to owner with parsable `communityPostId` → owner post detail → mark notification read → Like toggle → Like-to-Love replacement → create and reject second post → owner receives rejection notification.

  Assert database invariants after reactions:

  ```sql
  SELECT post_id, member_id, COUNT(*) AS reactions
  FROM community_reactions
  GROUP BY post_id, member_id
  HAVING COUNT(*) > 1;
  ```

  Expected: zero rows.

- [ ] **Step 2: Execute the news scenario**

  Create news with `newsType: 'nutrition'` and an `/uploads/app` image; verify the database stores `nutrition` and image path, the admin list returns `newsType` and public URL, then update it to `supplements` with a replacement image. Confirm a legacy news row with no prior explicit type now returns `nutrition`.

- [ ] **Step 3: Run final static and test suites**

  Run from the exact project directories:

  ```powershell
  # backend
  npm run prisma:validate
  npm run prisma:generate
  npm run typecheck
  npm test -- --runInBand
  npm run build

  # frontend
  npm run typecheck
  npm run build
  ```

  Expected: every command exits 0. If a pre-existing failure is discovered, capture the command and output separately; do not attribute it to this feature or mask it.

- [ ] **Step 4: Produce the requested completion report**

  Report modified/new files, models/relations/migration, exact APIs, Community/admin/notification/news/upload/permission changes, and the command result for Prisma validation, build, lint/typecheck, and tests. Include only real remaining manual blockers, such as applying the migration to a protected production database or updating the external Flutter client to consume the documented API.

## Plan self-review

- Spec coverage: Tasks 1–3 cover schema, member/admin APIs, authorization, moderation, notifications, pagination/filtering, ownership, and reactions. Task 4 covers required typed news and existing upload reuse. Task 5 covers the staff UI. Task 6 covers the requested functional scenarios and all build/test checks.
- Placeholder scan: no implementation step relies on a future task without an explicit interface, endpoint, DTO, payload, or verification command.
- Type consistency: Community enums and payload names are consistently `category`, `status`, `reactionType`, `adminReply`, `rejectionReason`, `likesCount`, `lovedItCount`, and `communityPostId`; news uses `newsType` in API and `news_type` in Prisma.
