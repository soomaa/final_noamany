# Customer Service Management — Design

## Goal

Deliver a fully Arabic, RTL Customer Service Management module for recording
customer-contact outcomes, collecting configured feedback answers, and reporting
on every subscription matching the selected filters. The module is available from
a new primary-sidebar section immediately after Settings & System Management.

## Scope

The section is labelled `إدارة خدمة العملاء` and contains these routes:

- `بنود الأسئلة` — `/customer-service/questions`
- `إضافة رأي العميل` — `/customer-service/add-feedback`
- `تقرير خدمة العملاء` — `/customer-service/reports`

All endpoints require the existing JWT guard and use the existing permission
mechanism. The menu is therefore hidden for users without the corresponding
route permission.

## Data model

Prisma will model three MySQL tables:

1. `cs_questions`: required text, enum answer type (`stars`, `yes_no`,
   `multiple_choice`, `text`), optional JSON options, and audit timestamps.
2. `cs_feedbacks`: the selected `club_members` client, its
   `club_subscriptions` subscription, enum call status (`answered`,
   `no_answer`, `call_later`), creator user, and timestamps.
3. `cs_feedback_answers`: one stored answer per feedback/question pair with a
   nullable text answer for contacts that were not answered.

Relations and indexes cover the report lookup path: client/subscription,
feedback creation time, and feedback answer lookup. The application will use
the existing client/member, subscription, branch, and authenticated-user tables
rather than introducing duplicate customer records.

## Backend behavior

`CustomerServiceModule` will expose:

- Question CRUD (`GET`, `POST`, `PUT`, `DELETE`), validating options only for
  multiple-choice questions and preventing malformed JSON.
- A paginated subscription search for the feedback-entry page. It accepts
  subscription status, branch, category/gender, and start/end-date filters and
  supplies the latest feedback timestamp per client/subscription.
- A feedback-create transaction. An answered call requires exactly one valid
  answer for every active question; no-answer and call-later calls persist only
  the contact status. `created_by` always comes from the JWT, not the request.
- A paginated report endpoint using a left join/equivalent relation strategy so
  subscriptions without feedback remain in the result set. Each row represents
  the latest feedback for its client/subscription when one exists.
- A read-only feedback-detail endpoint and filtered Excel/PDF export endpoints.
  The exported data uses the same query service as the report table so filters
  cannot diverge. Excel is generated with the project’s installed ExcelJS;
  print/PDF content is a UTF-8 Arabic print view suitable for browser PDF
  generation.

The backend normalizes report timestamps to the frontend as ISO values; display
formatting is performed consistently in the client as `YYYY-MM-DD hh:mm ص/م`.

## Frontend behavior

Three lazy-loaded React pages will use the project’s current query, form,
dialog, table, toast, and RTL components:

- Questions: an inline add/edit form and paginated table with confirmed delete.
- Add feedback: dynamic branch choices, server-paginated subscriptions, and an
  entry modal. The modal displays a 7-day recent-contact warning, conditionally
  renders star/radio/select/textarea controls, and hides questions for
  `no_answer` and `call_later`.
- Reports: identical filter semantics, server-paginated results, status badges,
  detail modal for answered feedback, and exports which preserve active filters.

The top-level navigation definition, route-to-label map, translation resources,
and route declarations are updated together so the new section is visible,
localized, and routable.

## Validation and failure handling

- Dates and numeric IDs are parsed defensively; invalid filters receive a 400
  validation response.
- A feedback can only be recorded for an existing in-scope subscription/client.
- Answered feedback cannot omit or answer a deleted/non-active question.
- Delete confirmation is required in the UI; backend referential integrity
  prevents orphaned answer data.
- Query, mutation, and export errors show Arabic, actionable toast messages
  while retaining the current filter state.

## Tests and verification

Automated coverage will test DTO validation, feedback transaction rules,
seven-day warning/latest-feedback logic, report inclusion of subscriptions with
no feedback, and row pagination/filter behavior. Verification will include
Prisma validation/generation, backend type checking and focused tests, and the
frontend typecheck/build.

## Assumptions

- "Client" means the current `club_members` record and "subscription" means
  `club_subscriptions`.
- The category filter maps to member gender using the application’s existing
  values for `حريمي` and `رجالي`.
- “Active questions” means all non-deleted configured questions; the specified
  question schema has no separate activation flag.
- The installed browser’s Arabic-capable fonts are used for the printable export
  view so generated PDF output remains UTF-8/RTL safe.
