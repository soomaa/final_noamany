# Online Subscription Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members submit manual online subscription requests for real all-branch plans, then let staff approve or reject them safely from the system.

**Architecture:** A portal membership item stores the selected real subscription type ID, while public APIs resolve the current plan and active payment methods server-side. A new online-request module snapshots every submitted commercial value; approval uses the existing subscription creation service and writes the member notification in the same protected workflow.

**Tech Stack:** NestJS, Prisma/MySQL migrations, React + TanStack Query, Vite vanilla public site, Jest, Node test scripts.

**Spec:** `docs/superpowers/specs/2026-09-21-online-subscriptions-design.md`

## Global Constraints

- Only types with `is_active = true` and `apply_to_all_branches = true` may be linked or publicly displayed.
- Price, name, duration, and end date always come from the server; do not accept them as browser authority.
- Only enabled `sales_pos_payment_methods` are returned and accepted.
- The public submission is multipart and accepts a single safe image as its payment proof.
- A request may transition from `pending` only once, to `approved` or `rejected`; rejection requires a reason.
- Approval must create a real system subscription through `ClubSubscriptionsService`, link it once, and notify the member.
- Static, unlinked membership-plan cards must not be presented as purchasable plans.

## Review Focus

- A plan or payment method disabled after the page initially loaded must be rejected on submit; cover in Task 3 service tests.
- Two reviewers approving the same pending request must yield exactly one real subscription; cover conditional transition in Task 5 tests.
- A receipt file that is not an image or exceeds configured upload limits must not be stored; cover controller upload validation in Task 3 tests.
- A member code that exists but does not match the submitted name must not create a request; cover input matching in Task 3 tests.
- A payment-method base type unsupported by subscription receipts must be rejected before approval; cover mapping validation in Task 5 tests.

---

### Task 1: Persist and administer the membership-plan subscription-type link

**Files:**
- Create: `backend/prisma/migrations/20260921120000_portal_membership_plan_subscription_type/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/modules/portal-management/portal-management.service.ts`
- Modify: `frontend/src/pages/portal-management/index.tsx`
- Test: `backend/src/modules/portal-management/portal-management.service.spec.ts`

**Interfaces:**
- Consumes: `club_subscription_types(id, name, price, days, is_active, apply_to_all_branches)`.
- Produces: `PortalOptions.subscriptionTypes: Array<{id:number;name:string;price:number;days:number}>` and membership-plan records with `data.subscriptionTypeId`.

- [ ] **Step 1: Write failing service tests**

```ts
it('offers only active types that apply to every branch', async () => {
  prisma.club_subscription_types.findMany.mockResolvedValue([
    { id: 1, name: 'سنوي', price: 1200, days: 365 },
  ]);
  await expect(service.options()).resolves.toEqual(expect.objectContaining({
    subscriptionTypes: [{ id: 1, name: 'سنوي', price: 1200, days: 365 }],
  }));
});

it('rejects saving a membership plan with an inactive or non-global type', async () => {
  prisma.club_subscription_types.findFirst.mockResolvedValue(null);
  await expect(service.create('membership-plans', inputWithType(9), 3))
    .rejects.toThrow('نوع الاشتراك المختار غير متاح للموقع');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd backend; npm test -- portal-management.service.spec.ts`

Expected: FAIL because `subscriptionTypes` and membership-plan validation do not exist.

- [ ] **Step 3: Add schema and migration**

```sql
ALTER TABLE portal_content_items
  ADD COLUMN subscription_type_id INT NULL,
  ADD INDEX idx_portal_content_subscription_type (subscription_type_id),
  ADD CONSTRAINT fk_portal_content_subscription_type
    FOREIGN KEY (subscription_type_id) REFERENCES club_subscription_types(id);
```

Add `subscription_type_id Int?` and its relation/index to the Prisma model, regenerate Prisma client, and preserve null for all non-membership content.

- [ ] **Step 4: Implement the server link contract**

```ts
type PortalSubscriptionTypeOption = { id: number; name: string; price: number; days: number };

private async assertWebsiteSubscriptionType(subscriptionTypeId: number) {
  const type = await this.prisma.club_subscription_types.findFirst({
    where: { id: subscriptionTypeId, is_active: true, apply_to_all_branches: true },
  });
  if (!type) throw new BadRequestException('نوع الاشتراك المختار غير متاح للموقع');
  return type;
}
```

Load these types in `options()`. For membership-plan create/update, parse `data.subscriptionTypeId`, call the guard, and save it as `subscription_type_id`; map it back as `data.subscriptionTypeId` plus resolved read-only name/price/days in list rows.

- [ ] **Step 5: Implement the portal form field**

Add `subscriptionType` to `FieldType`, `subscriptionTypes` to `Options`, and a required `subscriptionTypeId` field to `CONFIG['membership-plans']`. Render options as `اسم الباقة — السعر — المدة`, and present resolved values read-only after selection. Remove editable price/unit inputs from this configuration so the user cannot create a conflicting public price.

- [ ] **Step 6: Run focused tests and type/build verification**

Run: `cd backend; npm test -- portal-management.service.spec.ts`

Expected: PASS.

Run: `cd frontend; npm run build`

Expected: exit code 0.

### Task 2: Add the online-request schema, module, and protected list API

**Files:**
- Create: `backend/prisma/migrations/20260921121000_online_subscription_requests/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/online-subscriptions/online-subscriptions.module.ts`
- Create: `backend/src/modules/online-subscriptions/online-subscriptions.service.ts`
- Create: `backend/src/modules/online-subscriptions/online-subscriptions.controller.ts`
- Create: `backend/src/modules/online-subscriptions/dto/reject-online-subscription.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/online-subscriptions/online-subscriptions.service.spec.ts`

**Interfaces:**
- Produces: `OnlineSubscriptionsService.list(query,user)`, `getProof(id,user)`, `approve(id,user)`, and `reject(id,user,dto)`.
- Consumes: a future `submitPublic(input, proof)` API from Task 3 and `ClubSubscriptionsService.create(dto,user)` from Task 5.

- [ ] **Step 1: Write failing mapping/list tests**

```ts
it('maps every review column and never exposes the proof path in a list without authorization', async () => {
  prisma.online_subscription_requests.findMany.mockResolvedValue([pendingRequest]);
  await expect(service.list({}, manager)).resolves.toEqual(expect.objectContaining({
    items: [expect.objectContaining({ memberCode: 'M-100', status: 'pending', proofUrl: undefined })],
  }));
});

it('does not allow a manager outside the request branch to view its proof', async () => {
  await expect(service.getProof(8, otherBranchManager)).rejects.toThrow(ForbiddenException);
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run: `cd backend; npm test -- online-subscriptions.service.spec.ts`

Expected: FAIL because the module and service are absent.

- [ ] **Step 3: Add migration and Prisma model**

Create `online_subscription_requests` with the exact snapshots from the spec, nullable reviewer fields, a unique nullable `club_subscription_id`, indexes on `(status, created_at)`, `member_id`, `branch_id`, and foreign keys for the type, payment method, and created subscription. Use `VARCHAR(20)` status constrained to `pending`, `approved`, `rejected` by the application and migration check if the deployed MySQL version supports it.

- [ ] **Step 4: Implement protected read interfaces**

```ts
async list(query: ListOnlineSubscriptionRequestsQuery, user: JwtUser) {
  return { items: rows.map(this.mapRequest), total, page, pageSize };
}

async getProof(id: number, user: JwtUser) {
  const request = await this.findAllowedRequest(id, user);
  return { path: request.payment_proof_path };
}
```

Require the same authenticated permission pattern used by existing club-subscription administration, scope branches via `BranchScopeService`, and ensure proof resolution is only available after request authorization.

- [ ] **Step 5: Run focused tests**

Run: `cd backend; npm test -- online-subscriptions.service.spec.ts`

Expected: PASS for mapping and proof authorization.

### Task 3: Publish valid plans/payment methods and accept a safe public request

**Files:**
- Modify: `backend/src/modules/public-portal/public-portal.module.ts`
- Modify: `backend/src/modules/public-portal/public-portal.controller.ts`
- Modify: `backend/src/modules/public-portal/public-portal.service.ts`
- Create: `backend/src/modules/public-portal/dto/create-online-subscription-request.dto.ts`
- Modify: `backend/src/modules/uploads/uploads.service.ts`
- Test: `backend/src/modules/public-portal/public-portal.service.spec.ts`
- Test: `backend/src/modules/public-portal/public-portal.controller.spec.ts`

**Interfaces:**
- Produces: `GET /api/public/portal/membership-plans`, `GET /api/public/portal/payment-methods`, and multipart `POST /api/public/portal/online-subscriptions`.
- Consumes: `OnlineSubscriptionsService.submitPublic(input, file)` with server-resolved plan/payment/member details.

- [ ] **Step 1: Write failing public-service tests**

```ts
it('publishes only linked active global plans', async () => {
  prisma.portal_content_items.findMany.mockResolvedValue([linkedPlan]);
  await expect(service.membershipPlans()).resolves.toEqual([
    expect.objectContaining({ subscriptionTypeId: 7, price: 900, days: 90 }),
  ]);
});

it('rejects disabled payment methods and mismatched member identity', async () => {
  await expect(service.createOnlineSubscriptionRequest(badPayment, image)).rejects.toThrow('طريقة الدفع غير متاحة');
  await expect(service.createOnlineSubscriptionRequest(wrongName, image)).rejects.toThrow('كود العضو والاسم غير متطابقين');
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd backend; npm test -- public-portal.service.spec.ts public-portal.controller.spec.ts`

Expected: FAIL because the public routes and service methods are absent.

- [ ] **Step 3: Implement sanitized lookup methods**

```ts
async membershipPlans() {
  return this.prisma.portal_content_items.findMany({
    where: { content_type: 'membership-plans', is_active: 1,
      subscription_type: { is_active: true, apply_to_all_branches: true } },
  });
}

async paymentMethods() {
  return this.prisma.sales_pos_payment_methods.findMany({
    where: { is_enabled: true },
    select: { id:true, name:true, icon:true, description:true, base_method:true },
    orderBy: [{ sort_order:'asc' }, { id:'asc' }],
  });
}
```

Map decimal values to numbers and never select provider credentials.

- [ ] **Step 4: Implement multipart validation and submission**

Use `FileInterceptor('paymentProof')` with the project upload limits, image MIME whitelist, and public throttle. Validate DTO field formats; re-query the member, global active type, linked active plan, and active payment method. Store the proof in a dedicated upload category, calculate `requestedEndDate` with the existing subscription end-date helper, and call `onlineSubscriptions.submitPublic()` with only server-derived snapshots.

- [ ] **Step 5: Add review-focus test cases and run them**

```ts
it.each([['application/pdf'], ['text/plain']])('rejects non-image proof %s', async (mimetype) => {
  await expect(controller.createOnlineRequest(validDto, fakeFile(mimetype))).rejects.toThrow(BadRequestException);
});

it('rejects a plan disabled between browser load and submit', async () => {
  prisma.club_subscription_types.findFirst.mockResolvedValue(null);
  await expect(service.createOnlineSubscriptionRequest(validDto, image)).rejects.toThrow('الباقة غير متاحة');
});
```

Run: `cd backend; npm test -- public-portal.service.spec.ts public-portal.controller.spec.ts`

Expected: PASS.

### Task 4: Build the dynamic public membership and request flow

**Files:**
- Modify: `website-redesign/index.html`
- Modify: `website-redesign/src/main.js`
- Create: `website-redesign/subscribe.html`
- Create: `website-redesign/src/subscribe.js`
- Create: `website-redesign/src/subscribe.css`
- Modify: `website-redesign/src/portal.js`
- Test: `website-redesign/test/membership-subscription-flow.test.cjs`

**Interfaces:**
- Consumes: public plan/payment API contracts from Task 3.
- Produces: card links `/subscribe.html?plan=<subscriptionTypeId>` and a multipart submission UX.

- [ ] **Step 1: Write a failing DOM/API contract test**

```js
assert.match(renderMembership([{ subscriptionTypeId: 7, name: 'ربع سنوي', price: 900, days: 90 }]), /اشترك الآن/);
assert.match(renderMembership([{ subscriptionTypeId: 7 }]), /subscribe\.html\?plan=7/);
assert.doesNotMatch(renderMembership([]), /اطلب السعر/);
assert.deepEqual(buildRequestFormData(form).get('subscriptionTypeId'), '7');
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd website-redesign; node --test test/membership-subscription-flow.test.cjs`

Expected: FAIL because the dynamic request flow does not exist.

- [ ] **Step 3: Implement dynamic public cards**

Fetch `/membership-plans`, render current name/price/days with the portal marketing description/features, remove unlinked static card fallback, and use Arabic copy «اشترك الآن». On API failure or no results show a clear, non-purchasable empty/error state.

- [ ] **Step 4: Implement the two-stage subscribe page**

```js
async function submitOnlineSubscription(form) {
  const data = new FormData(form);
  const result = await api('/online-subscriptions', { method: 'POST', body: data });
  showSuccess(result.message);
}
```

Resolve `plan` from the query string against `/membership-plans`; stage one shows real plan details and enabled payment methods; stage two requires member code, matching client name, start date and `paymentProof`, while notes remain optional. Disable submit during submission and show API errors without losing the selected payment method.

- [ ] **Step 5: Run public-site tests and build**

Run: `cd website-redesign; node --test test/membership-subscription-flow.test.cjs; npm run build`

Expected: all tests pass and Vite build exits 0.

### Task 5: Approve/reject requests transactionally and notify the member

**Files:**
- Modify: `backend/src/modules/online-subscriptions/online-subscriptions.service.ts`
- Modify: `backend/src/modules/online-subscriptions/online-subscriptions.controller.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.module.ts` only if exporting `ClubSubscriptionsService` is required
- Test: `backend/src/modules/online-subscriptions/online-subscriptions.service.spec.ts`

**Interfaces:**
- Consumes: `ClubSubscriptionsService.create(dto, user)` and `am_member_notifications`.
- Produces: `POST /online-subscriptions/:id/approve` and `POST /online-subscriptions/:id/reject` endpoints with a single final state.

- [ ] **Step 1: Write failing transition tests**

```ts
it('approves once, creates one real subscription, links it and notifies the member', async () => {
  subscriptions.create.mockResolvedValue({ id: 77 });
  await service.approve(5, manager);
  expect(subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
    memberId: 10, subscriptionTypeId: 2, paidAmount: 900,
  }), manager);
  expect(tx.am_member_notifications.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ member_id: 10, type: 'online_subscription_approved' }),
  }));
});

it('rejects only with a nonblank reason and creates no subscription', async () => {
  await expect(service.reject(5, manager, { rejectionReason: '   ' })).rejects.toThrow();
  await service.reject(5, manager, { rejectionReason: 'الصورة غير واضحة' });
  expect(subscriptions.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd backend; npm test -- online-subscriptions.service.spec.ts`

Expected: FAIL because approve/reject transitions are absent.

- [ ] **Step 3: Implement approval with guarded transition**

First load and branch-authorize the pending request, then revalidate the member/type/payment method. Map the stored `payment_base_method` to a supported `ClubPaymentMethodValue`; reject unknown mappings. Call `ClubSubscriptionsService.create` with `branchId`, `memberId`, snapshot customer name, `subscriptionTypeId`, `startDate`, and the full server-snapshot paid value. Then conditionally update only `{ id, status: 'pending' }` to approved with `club_subscription_id`; if it loses the race, do not write a notification and report that the request was already reviewed. Create the approval notification only after a successful conditional approval.

- [ ] **Step 4: Implement rejection**

Trim and require `rejectionReason`; branch-authorize, then conditionally update `{ id, status: 'pending' }` to rejected with reviewer and timestamp. Create `am_member_notifications` with `type: 'online_subscription_rejected'` and JSON data `{ onlineSubscriptionRequestId, rejectionReason }` only after the conditional update succeeds.

- [ ] **Step 5: Add race and payment-map tests, then run**

```ts
it('does not create a second subscription when a competing reviewer wins', async () => {
  tx.online_subscription_requests.updateMany.mockResolvedValue({ count: 0 });
  await expect(service.approve(5, manager)).rejects.toThrow('تمت مراجعة الطلب بالفعل');
  expect(tx.am_member_notifications.create).not.toHaveBeenCalled();
});

it('refuses an unsupported stored payment base method before creating a subscription', async () => {
  request.payment_base_method = 'unsupported';
  await expect(service.approve(5, manager)).rejects.toThrow('طريقة الدفع غير مدعومة');
  expect(subscriptions.create).not.toHaveBeenCalled();
});
```

Run: `cd backend; npm test -- online-subscriptions.service.spec.ts`

Expected: PASS.

### Task 6: Add the administrative review page and navigation

**Files:**
- Create: `frontend/src/pages/online-subscriptions/index.tsx`
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/lib/nav.ts`
- Test: `frontend/src/pages/online-subscriptions/index.test.tsx`

**Interfaces:**
- Consumes: protected list/proof/approve/reject APIs from Tasks 2 and 5.
- Produces: the «اشتراكات الأونلاين» navigation item and review table.

- [ ] **Step 1: Write a failing component test**

```tsx
render(<OnlineSubscriptionsPage />);
expect(await screen.findByText('M-100')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'قبول' })).toBeEnabled();
await user.click(screen.getByRole('button', { name: 'رفض' }));
expect(screen.getByLabelText('سبب الرفض')).toBeRequired();
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd frontend; npm test -- online-subscriptions/index.test.tsx`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement table and actions**

Render columns for member code, name, type, start/end, notes, proof image, status, and actions. Fetch proof only when the manager requests viewing it. For pending requests show accept and reject; rejection dialog keeps confirm disabled until a trimmed reason exists. Invalidate the list and display the server result after any decision.

- [ ] **Step 4: Register navigation and permission visibility**

Add the page route beneath club subscriptions and a nav item named «اشتراكات الأونلاين» that requires the same review permission assigned by the new backend controller. Do not expose the item to users without that permission.

- [ ] **Step 5: Run component test and frontend build**

Run: `cd frontend; npm test -- online-subscriptions/index.test.tsx; npm run build`

Expected: test passes and build exits 0.

### Task 7: Run integration verification and manually exercise the full path

**Files:**
- Modify only if verification exposes a defect in files from Tasks 1–6.

**Interfaces:**
- Consumes: completed public and protected flows.
- Produces: evidence that the new path works without breaking existing subscriptions.

- [ ] **Step 1: Run all targeted backend and site tests**

Run: `cd backend; npm test -- portal-management.service.spec.ts public-portal.service.spec.ts public-portal.controller.spec.ts online-subscriptions.service.spec.ts`

Expected: PASS.

Run: `cd website-redesign; node --test test/render-hero.test.cjs test/header-navigation.test.cjs test/products-api-proxy.test.cjs test/membership-subscription-flow.test.cjs; npm run build`

Expected: PASS and exit code 0.

- [ ] **Step 2: Apply migrations and start local services**

Run: `cd backend; npm run prisma:generate; npm run prisma:validate; npm run prisma:push`

Then start the backend on its configured port and Vite on `127.0.0.1:5173`.

Expected: migration succeeds, public plan/payment endpoints return only eligible items, and the new page loads.

- [ ] **Step 3: Perform a controlled end-to-end check**

Create a linked active global plan and enabled payment method in the local dataset; submit an image-backed request for a test member; verify it appears pending in the review table. Reject one request and verify no `club_subscriptions` row is created plus a rejection notification exists. Approve a fresh request and verify one subscription, one link, and an approval notification exist.

- [ ] **Step 4: Review changed files and report evidence**

Run: `git diff --check` when the repository supports Git, plus `rg -n "اطلب السعر|online_subscription" website-redesign backend frontend`.

Expected: no whitespace errors, no purchasable «اطلب السعر» copy, and all new identifiers are limited to intended paths.
