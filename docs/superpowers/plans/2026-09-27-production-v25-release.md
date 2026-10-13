# Production v25 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a verified, full Noamany production ZIP containing every deployable change after v24 while preserving the server's configuration, uploads, and existing data.

**Architecture:** Build all local deployables first, then stage an allow-listed production tree rather than archiving the working directory. The staged tree contains the compiled backend and frontend plus all Prisma migrations; its deploy script resolves Node 20+, validates Prisma, backs up before applying only pending migrations, refreshes RBAC, and requests a Passenger restart. A separate deployment note verifies the externally served build and two required APIs after the server monitor restarts the process.

**Tech Stack:** NestJS/TypeScript, built static frontend assets, Prisma/MySQL, npm, bash, ZIP/SHA-256.

**Spec:** `F:/تعليمات الرفع .txt`

## Global Constraints

- Baseline is `release/noamany-production-update-20260927-v24-r1.zip`; target release is v25-r1.
- Build frontend, website-redesign, backend, and validate Prisma locally before packaging.
- Include only the allow-listed deployment files in the supplied instructions; include every current Prisma migration.
- Never include `.env`, `node_modules`, `uploads`, backups, logs, database dumps, or legacy import files.
- Never use `prisma migrate reset`, `db push --force-reset`, demo seed, `sudo`, or PM2.
- Deployment resolves Node.js 20+, runs `npm ci --include=dev`, Prisma generation/validation, backup, drift repair, pending migrations, RBAC sync, status, then `touch tmp/restart.txt`.
- Verification must prove ZIP contents, absence of forbidden files, SHA-256, syntax of compiled entrypoint, and the post-deploy public endpoints.

## Review Focus

- A locally changed TypeScript file must be reflected in its matching compiled `dist` artifact.
- Every migration directory present locally must be included in the ZIP, without relying on a server-side deletion.
- The release must not leak `.env` values, uploaded files, dependencies, or logs.
- The deploy script must select Node 20+ even when the default cPanel shell resolves Node 10.
- A restart request alone is insufficient evidence; the instructions must verify served assets and both required APIs after the monitor interval.

---

### Task 1: Establish production delta and build inputs

**Files:**
- Read: `release/noamany-production-update-20260927-v24-r1.zip`
- Read: frontend, website-redesign, and `backend` build configuration
- Create: release staging manifest (temporary, excluded from the ZIP)

**Interfaces:**
- Consumes: current workspace sources and v24 archive.
- Produces: an allow-list and a record of current migrations/build outputs for Task 2.

- [ ] Compare the deployable current files with v24 and inventory all current migration directories.
- [ ] Locate and run each required local build command and `npx prisma validate` from its owning project.
- [ ] Confirm that the compiled backend entrypoint and generated public frontend are present after builds.

### Task 2: Create a guarded production deployment payload

**Files:**
- Create: `release/noamany-production-update-20260927-v25-r1.zip`
- Create: `release/noamany-production-update-20260927-v25-r1.zip.sha256`
- Create: `release/DEPLOY-INSTRUCTIONS-production-update-20260927-v25-r1.txt`
- Modify/create inside ZIP: `deploy-production-update.sh`, `DEPLOY-INSTRUCTIONS.txt`

**Interfaces:**
- Consumes: Task 1 built artifacts and migration inventory.
- Produces: full production archive and exact terminal commands for Task 3.

- [ ] Stage only the files enumerated by the supplied upload instructions.
- [ ] Add a Node 20+ preflight and the required non-destructive deployment sequence, without PM2 or reset operations.
- [ ] Add post-restart commands that check served frontend marker plus membership-plans and payment-methods APIs.
- [ ] Create the ZIP and SHA-256 sidecar.

### Task 3: Verify release integrity

**Files:**
- Read: v25 ZIP, SHA-256 sidecar, generated deployment note.

**Interfaces:**
- Consumes: Task 2 archive.
- Produces: evidence that the archive is safe to upload.

- [ ] Verify the SHA-256 sidecar matches the archive.
- [ ] Verify every current migration is present in the ZIP.
- [ ] Verify the ZIP has every required entry and none of the prohibited paths.
- [ ] Extract the compiled entrypoint from the ZIP and run Node 20 syntax validation.
- [ ] Report the exact filename, hash, release delta, and terminal commands.
