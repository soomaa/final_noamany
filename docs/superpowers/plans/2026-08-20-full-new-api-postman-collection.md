# Full New API Postman Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an importable Postman collection for every documented current-system API route while excluding all legacy `/Api/` routes.

**Architecture:** Read the running local Swagger document at `/api/docs-json`, retain only lowercase `/api/` paths, and convert every HTTP operation into a Postman request. Reuse the hand-authored mobile requests where present so their validated sample bodies are preserved.

**Tech Stack:** NestJS Swagger/OpenAPI, Node.js standard library, Postman Collection v2.1 JSON.

**Spec:** User request in this thread: a complete Postman JSON file for the entire new application, with no old routes.

## Global Constraints

- Include only paths that begin with `/api/`; exclude `/Api/` case-sensitively.
- Do not include passwords, live tokens, database dumps, or user data in the exported collection.
- Preserve detailed request bodies for the existing mobile API requests.

---

### Task 1: Generate the collection from the local Swagger contract

**Files:**
- Create: `backend/scripts/build-full-new-api-postman-collection.js`
- Modify: `docs/NOAMANY_HR_FULL_NEW_API.postman_collection.json`

**Interfaces:**
- Consumes: `http://127.0.0.1:4000/api/docs-json` and `docs/NOAMANY_HR_NEW_MOBILE_API.postman_collection.json`
- Produces: a Postman v2.1 collection grouped by Swagger tag.

- [ ] **Step 1: Read the Swagger document and filter routes**

Run: `node scripts/build-full-new-api-postman-collection.js`

Expected: only lowercase `/api/` paths are present.

- [ ] **Step 2: Convert every operation to a Postman request**

Use the Swagger method, parameters, request body media type, and tag for each collection item.

- [ ] **Step 3: Reuse detailed mobile requests**

Match existing mobile requests by `METHOD /api/path` and use their bodies and tests instead of a generated placeholder.

- [ ] **Step 4: Validate the JSON and route counts**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/NOAMANY_HR_FULL_NEW_API.postman_collection.json','utf8'))"`

Expected: valid JSON, no `/Api/` entries, and each documented new route included.

### Task 2: Deliver the import instructions

**Files:**
- Modify: `docs/NOAMANY_HR_FULL_NEW_API.postman_collection.json`

**Interfaces:**
- Consumes: validated collection file.
- Produces: user-facing import URL and base URL configuration.

- [ ] **Step 1: State the collection’s coverage and exclusions**

Confirm the number of routes and operations plus exclusion of legacy paths.

- [ ] **Step 2: Provide import configuration**

Set `baseUrl` to `https://final.noamanycenter.com` and set `token` only after a login response.
