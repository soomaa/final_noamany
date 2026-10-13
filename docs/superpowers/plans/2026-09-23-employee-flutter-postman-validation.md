# Employee Flutter Postman Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an importable Postman collection for the installed employee Flutter application and an evidence-backed validation report against the authorized live server.

**Architecture:** Keep endpoint definitions in a Postman Collection v2.1 file and use Postman environment variables for the server URL and test account credentials. Authenticate once through `POST /Api/login_app`, store the returned bearer token in a collection variable, then execute only employee-scoped requests. Separate read-only verification from mutation tests so production data cannot be changed accidentally.

**Tech Stack:** Postman Collection v2.1 JSON, Newman/Postman CLI, NestJS legacy mobile compatibility API.

**Spec:** User request in this conversation: create a Postman file for the visible employee Flutter app using real server data and confirm its APIs work.

## Global Constraints

- Use the legacy employee-app API base path exactly as `<baseUrl>/Api`; `/Api` is case-sensitive.
- Never place live passwords, bearer tokens, personal phone numbers, employee IDs, or uploaded files in the committed collection or report.
- Require an explicit production-write decision before calling any endpoint that creates, edits, deletes, approves, rejects, punches attendance, uploads a file, changes a password, or registers a device token.
- All authenticated requests must use the `Authorization: Bearer {{accessToken}}` header created by the login request.
- Mark an endpoint as verified only when its HTTP response and legacy `status` envelope have been observed from the authorized server during this run.

## Review Focus

- Wrong base-path casing: test that the configured URL is `/Api`, not `/api`.
- Invalid or expired token: ensure protected requests report authentication failure rather than a false success.
- Login response shape: extract only `data.access_token`, and fail clearly if it is absent.
- Employee isolation: use only the authenticated employee identity; never supply or trust a different `emp_id` in test data.
- Production mutation safety: mutation requests must be disabled by default and require an explicit `allowWrites=true` environment variable.

---

### Task 1: Inventory the actual legacy employee-app contract

**Files:**
- Read: `backend/src/modules/mobile/legacy-mobile.controller.ts`
- Read: `backend/src/modules/mobile/legacy-mobile-compat.service.ts`
- Create: `docs/api/employee-flutter-api-inventory.md`

**Interfaces:**
- Consumes: Nest controller route decorators and legacy request-field aliases.
- Produces: a route inventory grouped by the Flutter app tiles, request fields, auth requirement, and mutation classification.

- [ ] **Step 1: List every explicit `/Api` action and every dynamic-dispatch action**

Run:

```powershell
Select-String -Path backend/src/modules/mobile/legacy-mobile.controller.ts -Pattern "@All\('"
```

Expected: legacy login, profile, leave, permission, loan, task, warning, circular, attendance, and dynamic action route names.

- [ ] **Step 2: Classify each action as read-only or mutating**

Create a table with `Action`, `Flutter screen`, `Method`, `Authentication`, `Risk`, and `Required payload variables` columns. Classify `login_app`, `getProfile`, list/detail/report actions as read-only; classify create/edit/delete/action/upload/punch/device-token/password endpoints as mutation actions.

- [ ] **Step 3: Verify the inventory matches the visible app tiles**

Check that messages, permissions, leaves, attendance, warnings, correspondence, shift swaps, circulars, overtime, and statistics each have at least one mapped API action.

- [ ] **Step 4: Commit**

```powershell
git add docs/api/employee-flutter-api-inventory.md
git commit -m "docs: inventory employee Flutter API actions"
```

### Task 2: Build the importable Postman collection and safe environment template

**Files:**
- Create: `postman/employee-flutter-api.postman_collection.json`
- Create: `postman/employee-flutter-api.environment.template.json`
- Test: Postman Collection schema import and pre-request/test scripts.

**Interfaces:**
- Consumes: `baseUrl`, `employeeLogin`, `employeePassword`, `accessToken`, `allowWrites`, and endpoint-specific fixture variables from the environment template.
- Produces: a Collection v2.1 document that can be imported into Postman and a credential-free environment template.

- [ ] **Step 1: Create a failing collection validation command**

Run:

```powershell
npx --yes @apidevtools/swagger-cli validate postman/employee-flutter-api.postman_collection.json
```

Expected: failure before the file exists; after implementation, use Postman/Newman import validation instead because this is a Postman collection rather than an OpenAPI document.

- [ ] **Step 2: Add collection-level authentication bootstrap**

Add `POST {{baseUrl}}/Api/login_app` with this JSON body:

```json
{
  "phone": "{{employeeLogin}}",
  "user_pass": "{{employeePassword}}"
}
```

Add a Postman test script that asserts `status === 200`, asserts `body.data.access_token` is a nonempty string, and saves it to `accessToken`.

- [ ] **Step 3: Add read-only folder requests with response assertions**

Create folders for Profile & notifications, Messages, Permissions, Leaves, Attendance, Warnings, Correspondence, Shift swaps, Circulars, Overtime, Statistics, and Application metadata. Each request must assert both HTTP success and the legacy envelope `body.status === 200`.

- [ ] **Step 4: Add mutation requests disabled by safety gate**

Every mutation request must include a pre-request script that skips/fails when `allowWrites !== 'true'`. Keep payloads variable-driven, such as `{{leaveTypeId}}`, `{{leaveStartDate}}`, and `{{leaveEndDate}}`; never hard-code staff IDs or personal data.

- [ ] **Step 5: Create the environment template**

Include blank values for `baseUrl`, `employeeLogin`, `employeePassword`, mutation fixtures, and `allowWrites` set to `false`. Do not include a token value.

- [ ] **Step 6: Import and validate locally**

Run:

```powershell
npx --yes newman run postman/employee-flutter-api.postman_collection.json -e postman/employee-flutter-api.environment.template.json --folder "Application metadata"
```

Expected: requests are structurally importable; without a supplied server URL, the command should fail at connection time rather than expose secrets or write data.

- [ ] **Step 7: Commit**

```powershell
git add postman/employee-flutter-api.postman_collection.json postman/employee-flutter-api.environment.template.json
git commit -m "test: add employee Flutter Postman collection"
```

### Task 3: Execute authorized live-server verification and report evidence

**Files:**
- Create: `docs/api/employee-flutter-api-validation-YYYY-MM-DD.md`
- Read: `postman/employee-flutter-api.postman_collection.json`

**Interfaces:**
- Consumes: a user-provided authorized server URL and dedicated employee test credentials through a local, untracked Postman environment file.
- Produces: a report of endpoint, test mode, HTTP result, envelope result, timestamp, and sanitized error/message where applicable.

- [ ] **Step 1: Validate login and all read-only folders**

Run:

```powershell
npx --yes newman run postman/employee-flutter-api.postman_collection.json -e <untracked-authorized-environment>.json --folder "Authentication" --folder "Read-only"
```

Expected: each executed request returns HTTP 200 and JSON with `status: 200`; record any exception verbatim only after removing tokens and personal data.

- [ ] **Step 2: Validate mutation tests only if production writes are approved**

Set `allowWrites` to `true` only after explicit authorization. Use a dedicated non-production employee or user-approved disposable records, then run only the requested mutation folders.

- [ ] **Step 3: Verify cleanup state for every successful mutation**

For requests that can be cancelled or deleted, invoke the matching employee-owned cleanup endpoint and record the resulting ID and outcome. Do not attempt destructive cleanup where the endpoint changes payroll, attendance, or approval history.

- [ ] **Step 4: Write the sanitized validation report**

Include a summary count: verified, failed, skipped due to missing test data, and intentionally not run due to production-write safety. Include exact route names but redact credentials, tokens, IDs, phones, documents, and server host if requested.

- [ ] **Step 5: Commit**

```powershell
git add docs/api/employee-flutter-api-validation-YYYY-MM-DD.md
git commit -m "docs: record employee Flutter API validation"
```
