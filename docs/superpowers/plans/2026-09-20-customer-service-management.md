# Customer Service Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Arabic RTL customer-service question, feedback-entry, and report module with protected APIs, exports, and sidebar access.

**Architecture:** Add a focused NestJS `customer-service` module backed by three Prisma tables and a shared subscription-query service. Three lazy React pages consume its typed API: question configuration, client feedback capture, and reporting/exports.

**Tech Stack:** NestJS 11, Prisma 5/MySQL, class-validator, ExcelJS, React 18, TypeScript, React Query, React Hook Form, Radix UI, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-20-customer-service-management-design.md`

## Global Constraints

- Arabic-first UI and RTL-compatible controls at `/customer-service/questions`, `/customer-service/add-feedback`, and `/customer-service/reports`.
- Insert the new primary sidebar section directly after `settings`, with the three specified sub-links.
- All HTTP endpoints use the project JWT guard and route/permission checks.
- Results tables paginate on the server; reports retain subscriptions with no feedback.
- Persist all contact states, but require every configured answer only for `answered` calls.
- Display persisted timestamps in 12-hour Arabic `ص`/`م` format; never localize/filter by display strings.
- Do not introduce a client-side-only export or a duplicate customer/subscription table.

## Review Focus

- An `answered` submission with one missing question must be rejected atomically with no feedback row created.
- A report must retain subscriptions with no feedback after every filter combination.
- Multiple feedback records for one subscription must resolve table/report metadata to the latest `created_at` record.
- A `multiple_choice` question must reject an answer not in its persisted option list.
- A seven-day warning must use the latest feedback for the exact client/subscription, not a different subscription owned by that client.

---

### Task 1: Prisma schema, database migration, and service contracts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_customer_service_management/migration.sql`
- Create: `backend/src/modules/customer-service/dto/customer-service.dto.ts`
- Create: `backend/src/modules/customer-service/customer-service.module.ts`
- Create: `backend/src/modules/customer-service/customer-service.service.ts`
- Test: `backend/src/modules/customer-service/customer-service.service.spec.ts`

**Interfaces:**
- Produces `CustomerServiceService.listQuestions`, `createQuestion`, `updateQuestion`, `removeQuestion`, `listSubscriptions`, `createFeedback`, `listReport`, `feedbackDetails`, `exportReport`.
- Produces DTOs `CreateQuestionDto`, `UpdateQuestionDto`, `ListCustomerServiceSubscriptionsDto`, `CreateFeedbackDto`, and `ListCustomerServiceReportDto`.

- [ ] **Step 1: Write failing service tests for validation and latest-feedback selection.**

```ts
it('rejects answered feedback when a configured question is missing', async () => {
  prisma.cs_questions.findMany.mockResolvedValue([{ id: 7, question_type: 'text' }]);
  await expect(service.createFeedback({ clientId: 1, subscriptionId: 2, callStatus: 'answered', answers: [] }, user))
    .rejects.toThrow('يجب الإجابة على جميع بنود الأسئلة');
});

it('keeps a subscription with no feedback in a report row', async () => {
  prisma.$queryRaw.mockResolvedValue([{ subscriptionId: 2, feedbackId: null }]);
  await expect(service.listReport({ page: 1, pageSize: 20 }, user)).resolves.toMatchObject({ data: [{ feedbackId: null }] });
});
```

- [ ] **Step 2: Run the focused Jest test and verify it fails because the module does not exist.**

Run: `npm test -- --runInBand src/modules/customer-service/customer-service.service.spec.ts`

Expected: FAIL with a missing module/file error.

- [ ] **Step 3: Add Prisma enums/models, relations, and the migration.**

```prisma
enum CsQuestionType { stars yes_no multiple_choice text }
enum CsCallStatus { answered no_answer call_later }

model cs_feedbacks {
  id Int @id @default(autoincrement())
  client_id Int
  subscription_id Int
  call_status CsCallStatus @default(answered)
  created_by Int
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  @@index([client_id, subscription_id, created_at])
}
```

Define the remaining `cs_questions` and `cs_feedback_answers` fields, all real foreign-key relations, and SQL foreign keys/indexes matching the Prisma declarations.

- [ ] **Step 4: Implement DTOs and the transactional service.**

```ts
async createFeedback(dto: CreateFeedbackDto, user: JwtUser) {
  return this.prisma.$transaction(async (tx) => {
    const questions = await tx.cs_questions.findMany({ orderBy: { id: 'asc' } });
    this.assertFeedbackAnswers(dto, questions);
    const feedback = await tx.cs_feedbacks.create({ data: { client_id: dto.clientId, subscription_id: dto.subscriptionId, call_status: dto.callStatus, created_by: user.id } });
    if (dto.callStatus === 'answered') await tx.cs_feedback_answers.createMany({ data: dto.answers.map((answer) => ({ feedback_id: feedback.id, question_id: answer.questionId, answer_text: answer.answerText })) });
    return feedback;
  });
}
```

Validate option membership, scope, client/subscription pairing, and use a left-join/latest-feedback query for the shared table/report result.

- [ ] **Step 5: Run schema generation, focused tests, and backend typecheck.**

Run: `npm run prisma:validate && npm run prisma:generate && npm test -- --runInBand src/modules/customer-service/customer-service.service.spec.ts && npm run typecheck`

Expected: all commands exit 0.

### Task 2: Protected controller, branch choices, reports, and exports

**Files:**
- Create: `backend/src/modules/customer-service/customer-service.controller.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/modules/customer-service/customer-service.service.ts`
- Modify: `backend/src/modules/customer-service/customer-service.service.spec.ts`

**Interfaces:**
- Consumes Task 1 service and DTOs.
- Produces protected REST endpoints rooted at `/customer-service`.

- [ ] **Step 1: Write failing controller/service tests for current-user authorship, 7-day warning, and export filters.**

```ts
it('uses the JWT user rather than a request creator id', async () => {
  await controller.createFeedback({ clientId: 1, subscriptionId: 2, callStatus: 'no_answer', answers: [] }, { id: 99 } as JwtUser);
  expect(service.createFeedback).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 99 }));
});

it('returns recent-contact metadata only for feedback in the preceding seven days', async () => {
  await expect(service.listSubscriptions({ page: 1, pageSize: 20 }, user)).resolves.toMatchObject({ data: [expect.objectContaining({ hasRecentFeedback: true })] });
});
```

- [ ] **Step 2: Run focused tests and verify the controller is absent.**

Run: `npm test -- --runInBand src/modules/customer-service/customer-service.service.spec.ts`

Expected: FAIL until controller endpoint delegation and metadata are implemented.

- [ ] **Step 3: Implement authenticated route handlers and permissions.**

```ts
@UseGuards(JwtAuthGuard)
@Controller('customer-service')
export class CustomerServiceController {
  @Get('questions') listQuestions() { return this.service.listQuestions(); }
  @Post('feedback') createFeedback(@Body() dto: CreateFeedbackDto, @CurrentUser() user: JwtUser) { return this.service.createFeedback(dto, user); }
  @Get('reports/export/excel') exportExcel(@Query() dto: ListCustomerServiceReportDto, @Res() res: Response, @CurrentUser() user: JwtUser) { return this.service.writeExcel(dto, user, res); }
}
```

Add question CRUD, subscription search, branches, report list, details, Excel, and printable HTML endpoints. Register the module in `AppModule`.

- [ ] **Step 4: Implement exports from the same filtered report query.**

```ts
const rows = await this.reportRows(query, user, { paginate: false });
worksheet.addRows(rows.map(toExportRow));
response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
await workbook.xlsx.write(response);
```

Set Arabic worksheet direction/right alignment and return UTF-8 RTL HTML with a print script for the PDF/print action.

- [ ] **Step 5: Run focused tests and typecheck.**

Run: `npm test -- --runInBand src/modules/customer-service/customer-service.service.spec.ts && npm run typecheck`

Expected: all tests pass and no TypeScript errors occur.

### Task 3: Frontend API layer, navigation, routes, and questions page

**Files:**
- Create: `frontend/src/lib/customer-service.ts`
- Create: `frontend/src/pages/customer-service/questions.tsx`
- Modify: `frontend/src/lib/nav.ts`
- Modify: `frontend/src/lib/routes.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: frontend page export barrel used by `frontend/src/app/router.tsx`
- Modify: locale resources used by navigation and page labels

**Interfaces:**
- Consumes `/customer-service/questions` REST endpoints from Task 2.
- Produces `CustomerServiceQuestionsPage` and typed client functions used by Tasks 4–5.

- [ ] **Step 1: Write a failing page/API test or TypeScript assertion for question payload conversion.**

```ts
expect(toQuestionPayload({ questionText: 'ما رأيك؟', questionType: 'multiple_choice', optionsText: 'ممتاز, جيد' }))
  .toEqual({ questionText: 'ما رأيك؟', questionType: 'multiple_choice', options: ['ممتاز', 'جيد'] });
```

- [ ] **Step 2: Run frontend typecheck and verify missing imports/page errors.**

Run: `npm run typecheck`

Expected: FAIL before adding the new page/API exports.

- [ ] **Step 3: Add the typed query/mutation client and questions CRUD screen.**

```ts
export type CsQuestionType = 'stars' | 'yes_no' | 'multiple_choice' | 'text';
export const customerServiceApi = {
  listQuestions: () => api.get<CsQuestion[]>('/customer-service/questions'),
  createQuestion: (payload: QuestionPayload) => api.post('/customer-service/questions', payload),
};
```

Render an RTL question form, conditional comma-separated option field, edit dialog, confirmed delete dialog, and server-paginated question table.

- [ ] **Step 4: Add the top-level navigation and route declarations.**

```ts
{ id: 'customer-service', icon: Headphones, items: [
  { to: '/customer-service/questions' },
  { to: '/customer-service/add-feedback' },
  { to: '/customer-service/reports' },
] }
```

Place the declaration immediately after the `settings` section, register all three lazy routes, route labels, and Arabic/English localization keys.

- [ ] **Step 5: Run frontend checks.**

Run: `npm run typecheck && npm run build`

Expected: both commands exit 0.

### Task 4: Feedback capture page and dynamic answer modal

**Files:**
- Create: `frontend/src/pages/customer-service/add-feedback.tsx`
- Modify: `frontend/src/lib/customer-service.ts`
- Test: focused frontend test file if the project test runner is configured; otherwise compile assertions in `add-feedback.tsx`

**Interfaces:**
- Consumes typed questions/subscriptions/branches and `createFeedback` from Tasks 2–3.
- Produces `CustomerServiceAddFeedbackPage`.

- [ ] **Step 1: Write failing validation tests for question visibility and required answers.**

```ts
expect(visibleQuestions('no_answer', questions)).toEqual([]);
expect(validateFeedback({ callStatus: 'answered', answers: {} }, questions)).toContain('الرجاء الإجابة على جميع الأسئلة');
```

- [ ] **Step 2: Run the focused check and verify it fails before helpers/component exist.**

Run: `npm run typecheck`

Expected: FAIL with unresolved helper/component names.

- [ ] **Step 3: Implement filters, server table, and contact modal.**

```tsx
{callStatus === 'answered' && questions.map((question) => (
  <QuestionAnswerField key={question.id} question={question} value={answers[question.id] ?? ''} onChange={setAnswer} />
))}
```

Map `stars` to keyboard-accessible 1–5 buttons, `yes_no` to radios, `multiple_choice` to the configured select options, and `text` to a textarea. Show the precise recent feedback warning returned by the server and save status-only calls without answer controls.

- [ ] **Step 4: Add Arabic timestamp formatting utility use and mutation error handling.**

```ts
export const formatArabicAmPm = (date: string) => format(new Date(date), 'yyyy-MM-dd hh:mm').replace(/AM|PM/, (m) => m === 'AM' ? 'ص' : 'م');
```

Keep filter values on query/mutation failures and invalidate the subscription query after a successful save.

- [ ] **Step 5: Run frontend typecheck/build.**

Run: `npm run typecheck && npm run build`

Expected: both commands exit 0.

### Task 5: Report page, details modal, and end-to-end verification

**Files:**
- Create: `frontend/src/pages/customer-service/reports.tsx`
- Modify: `frontend/src/lib/customer-service.ts`
- Modify: `backend/src/modules/customer-service/customer-service.service.spec.ts`

**Interfaces:**
- Consumes paginated report, feedback detail, and export endpoints from Task 2.
- Produces `CustomerServiceReportsPage`.

- [ ] **Step 1: Write failing checks for status labels, no-feedback fallback, and details availability.**

```ts
expect(reportStatusLabel(null)).toBe('لم يتم التواصل');
expect(canShowFeedbackDetails({ feedbackId: 3, callStatus: 'answered', answersCount: 1 })).toBe(true);
expect(canShowFeedbackDetails({ feedbackId: 3, callStatus: 'no_answer', answersCount: 0 })).toBe(false);
```

- [ ] **Step 2: Run the focused check and verify it fails before the report view exists.**

Run: `npm run typecheck`

Expected: FAIL with missing report symbols.

- [ ] **Step 3: Implement the report table and read-only details dialog.**

```tsx
{row.feedbackId && row.answersCount > 0
  ? <Button onClick={() => setDetailFeedbackId(row.feedbackId)}>تفاصيل</Button>
  : <span>{row.callStatus === 'no_answer' ? 'لا يوجد رد' : '-'}</span>}
```

Render all ten specified columns, maps statuses to Arabic badges, and displays client, employee, status, exact timestamp, question text, and answer text in the dialog.

- [ ] **Step 4: Implement filtered exports.**

```ts
const exportReport = (kind: 'excel' | 'print') => window.open(customerServiceApi.exportUrl(kind, filters), '_blank', 'noopener');
```

Send the active filters unchanged to both endpoints, download Excel with the response filename, and open the UTF-8 print view for browser PDF generation.

- [ ] **Step 5: Run complete verification.**

Run: `npm --prefix backend run prisma:validate && npm --prefix backend run typecheck && npm --prefix backend test -- --runInBand src/modules/customer-service/customer-service.service.spec.ts && npm --prefix frontend run typecheck && npm --prefix frontend run build`

Expected: every command exits 0; visual smoke check confirms RTL placement, question-type controls, warning banner, empty-feedback report row, details modal, and export buttons.
