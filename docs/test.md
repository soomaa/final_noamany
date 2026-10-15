ONE80 Codebase Exploration Report
ONE80 (internally named ONE80 Gym & Fitness Hub) is a full-stack gym + HR platform migrated from a legacy CodeIgniter 3 system. It is a monorepo with separate frontend and backend, backed by MySQL via Prisma.

1. Project Structure
Layer	Stack	Location
Frontend
React 18, Vite 6, TypeScript, Tailwind, Radix/shadcn, React Router, TanStack Query, React Hook Form + Zod
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/
Backend
NestJS 10, Prisma 5, JWT auth, Swagger
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/backend/
Database
MySQL — large legacy schema + ONE80 additions
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/backend/prisma/schema.prisma
Deployment
Backend serves built SPA from backend/public/; API prefix /api
backend/src/main.ts
Top-level layout:

frontend/src/ — UI, routing, hooks, types
backend/src/modules/ — domain modules (employees, club, sales, rbac, etc.)
backend/prisma/ — schema, migrations, seeds
make-release.sh — release script
There is no root README; package names are one80-hr-frontend and one80-hr-backend.

2. Navigation & Routing
Entry points:

/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/App.tsx → AppRouter
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/app/router.tsx — all routes
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/lib/nav.ts — sidebar sections
Top-level nav sections (in order):

club — members, subscriptions, lockers, fitness, events, cafe
gym-sales — inventory, procurement, POS/sales
financial-reports — finance dashboards/reports
accounting — GL, statements
app-management — mobile app content
hr — org, employees, attendance, payroll, leaves, HR affairs
settings — system administration (roles, users, audit, automation, etc.)
Each section has a hub at /hub/:section (e.g. /hub/hr, /hub/settings).

Route guard: /Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/components/auth/route-guard.tsx uses usePermission().canRoute() — unmapped routes are allowed; mapped routes require ${resourceKey}:view.

3. HR Section
Branch management
Area	Path
Frontend page
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/pages/org/branches.tsx
Route
/org/branches
Backend
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/backend/src/modules/branches/
API
GET/POST/PATCH/DELETE /api/branches
RBAC key
org.branches
Status: Implemented. CRUD on tbl_branches + geofence coords in branch_settings. Frontend has a NotImplementedState fallback if the API returns 501, but the backend module exists.

Departments & job titles
Area	Path
Frontend page
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/pages/org/departments.tsx
Route
/org/departments
Backend
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/backend/src/modules/org/
API
GET /departments/tree, GET/POST/PATCH/DELETE /departments, GET/POST/PATCH/DELETE /departments/job-titles
RBAC key
org.departments
Status: Implemented. Uses hr_edarat_aqsam (dept/section hierarchy with code ranges) and department_jobs (job titles). The legacy departments table exists in Prisma but is not used by the org module.

Employee forms
Area	Path
List
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/pages/employees/list.tsx → /employees
Add/Edit wizard
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/pages/employees/form.tsx → /employees/new, /employees/:id/edit
Profile
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/pages/employees/profile.tsx
Backend
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/backend/src/modules/employees/
API
GET/POST/PUT/PATCH/DELETE /api/employees + finance, dwam, banks, contract, documents sub-resources
RBAC keys
employees.list, employees.new (route), employees.documents, etc.
Status: Implemented. 6-step wizard (personal, work, finance, insurance, documents, review). On create, auto-provisions a login user and assigns an RBAC role via roleId (employees.service.ts → provisionUser).

Other HR routes (all wired in router)
Attendance: /attendance/*
Payroll: /payroll/*
Leaves/requests: /leaves, /permissions, /requests, /missions
Loans/penalties: /loans, /penalties, /rewards
HR affairs: /hr/circulars, /hr/warnings, /hr/evaluations, /hr/custody, /hr/job-requests, /hr/messages, /hr/tasks, etc.
Termination: /termination/clearance, /termination/archive
4. System Management Section
In the UI this is the settings nav section (RBAC module key: admin — "الإعدادات والنظام").

Feature	Frontend	Route	Backend
Roles & permissions matrix
frontend/src/pages/admin/roles.tsx
/admin/roles
backend/src/modules/rbac/admin/ → /api/rbac/*
User exceptions
frontend/src/pages/admin/exceptions.tsx
/admin/exceptions
same
RBAC audit
frontend/src/pages/admin/audit.tsx
/admin/audit
same
Users list
frontend/src/pages/users/index.tsx
/users
backend/src/modules/users/
User management
frontend/src/pages/users/manage.tsx
/users/manage
backend/src/modules/user-admin/
Business audit
frontend/src/pages/settings/business-audit.tsx
/settings/business-audit
gym-ops module
Automation
frontend/src/pages/settings/automation.tsx
/settings/automation
Backup/export
frontend/src/pages/settings/backup.tsx
/settings/backup
Webhooks
frontend/src/pages/settings/webhooks.tsx
/settings/webhooks
Company data
frontend/src/pages/company.tsx
/company
settings module
Forms settings
frontend/src/pages/settings/forms.tsx
/settings/forms
forms-settings module
Locations/cities
frontend/src/pages/settings/locations.tsx
/settings/locations
locations module
App users / push
settings/app-users, settings/push
app-users, push modules
Gap: admin.insurance (/settings/insurance) is in the RBAC catalog and has a backend controller (backend/src/modules/insurance-settings/), but no frontend page or router entry was found.

5. Members Section
Add member form (actual creation UI)
Area	Path
Primary UI
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/pages/club/members.tsx
Route
/club/members
Backend
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/backend/src/modules/club-members/
API
POST /api/club-members (DTO: UpsertClubMemberDto)
RBAC key
club.members
Add member is a dialog on the members management page ("عضو جديد"). Fields: branch, name, phone, gender, national ID (cardNumber), email, DOB, address, marital status, job title, membership type, dates, notes, autoCreateUser, isActive. Supports duplicate check and optional mobile app user creation.

/club/subscriptions/member-form — not an add form
Area	Path
Page
/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/pages/club/member-form.tsx
Route
/club/subscriptions/member-form
This page looks up an existing member by code and prints a financial summary (subscriptions + receipts). It does not create members.

Related member routes
Reception: /club/reception
Attendance: /club/members/attendance
Groups: /club/members/groups
Barcode: /club/members/barcode-search, barcode-management
Subscriptions (can include walk-in customers): /club/subscriptions/new → opens create dialog on subscriptions page
Route constants: /Users/fatmaatefkasem/Desktop/nomany_hr/GYM/ONE80/frontend/src/lib/club-routes.ts

6. Roles & Permissions System
Architecture (enterprise RBAC — primary)
Component	Path
Catalog (resource tree)
backend/src/modules/rbac/catalog/rbac.catalog.ts
Permission engine
backend/src/modules/rbac/engine/permission-engine.service.ts
Resolver (inheritance)
backend/src/modules/rbac/engine/permission-resolver.ts
Guard
backend/src/common/guards/permissions.guard.ts
Decorator
backend/src/common/decorators/requires-permission.decorator.ts
Me API
backend/src/modules/rbac/me.controller.ts → GET /api/me/permissions, /me/nav, /me/workspace
Frontend hook
frontend/src/hooks/use-permission.ts
Admin UI
frontend/src/pages/admin/roles.tsx, frontend/src/hooks/use-rbac.ts
Seed
backend/prisma/seed-rbac.ts, backend/prisma/sql/rbac.sql
How it works
Resources form a tree (module → group → page) with stable keys like employees.list, club.members.
Actions: view, create, update, delete, approve, reject, export, print, audit, configure, execute, manage, use.
Permission key format: resourceKey:action (e.g. org.branches:create).
Resolution order: user exceptions (deny wins) → role permissions (tri-state with inheritance up the tree) → deny by default.
Super-admin bypass: rbac_roles.is_super_admin or legacy users.level === 1.
Un-roled users: fallback role from legacy users.level via legacyRoleKeyForLevel.
Data scopes (optional): own, team, branch, department, global on rbac_role_scopes.
Frontend: canRoute(pathname) uses longest-prefix match on routeMap; can('employees.list:create') for button-level gating.
Legacy system (still present)
users + pages + permissions (user↔page junction)
@RequiresPage decorator still supported in PermissionsGuard
Per-user permission tree UI replaced by /admin/exceptions?user={id} (see router redirect from /users/:id/permissions)
7. Database Models (key entities)
Users
model users {
  user_id, username, password, name, email, level, role_id_fk,
  branch_id_fk, emp_code, approved, must_change_password, ...
}
Path: backend/prisma/schema.prisma (~line 1128)

Employees (authoritative)
model employees {
  id, emp_code (business key), employee (name), branch_id_fk,
  edara_id, qsm_id, mosma_wazefy_* (job title),
  ~150 legacy HR columns + ONE80 additions:
  previous_experience, skills, languages, marital_status,
  national_address, basic_salary, app_user_id
}
Relations: emp_files, hr_finance_employes, employees_branches, hr_emp_dwam, app_user

Legacy read-only mirror: tbl_employees

Branches
model tbl_branches { branch_id, branch_name, from_id }
model branch_settings { title, lat_map, long_map }  // geofence by branch name
Departments / sections (active)
model hr_edarat_aqsam {
  id, title_id, title, title_code, from_id_fk (parent),
  from_code, to_code  // employee code ranges
}
model department_jobs { id, name, from_id_fk, edara_id, dep_code, in_order }
Unused legacy: departments, department_job_relations

Club members
model club_members {
  id, member_code (unique), name, phone (unique), email,
  gender, card_number, date_of_birth, address, marital_status, job_title,
  profile_picture, branch_id, membership_type_id,
  start_date, end_date, notes, is_active, is_deleted,
  app_user_id, created_by, created_at
}
Related: club_membership_types, club_attendance, club_subscriptions, club_member_groups

Mobile app users: api_users (linked from employees and optionally club members)

RBAC tables
rbac_actions, rbac_resources, rbac_resource_actions, rbac_roles, rbac_role_permissions, rbac_user_roles, rbac_user_exceptions, rbac_role_scopes, rbac_audit_log

8. Sales Module (brief)
Under gym-sales nav section:

Inventory: backend/src/modules/inventory/, routes /inventory/*
Procurement: backend/src/modules/procurement/, routes /procurement/*
Sales/POS: backend/src/modules/sales/, routes /sales/* (bookings, invoices, shifts, revenue, treasury, pos-admin)
RBAC module key: gym-sales in catalog.

9. What Exists vs What Needs Building
Already built (substantial)
Full HR module surface: org, employees (multi-tab wizard + user provisioning), attendance, payroll, leaves, requests, loans, penalties, HR affairs, termination
Club operations: members CRUD, subscriptions, lockers, fitness, events, cafe
Gym sales: inventory, procurement, POS
Finance, accounting, app management
Enterprise RBAC with admin matrix UI, user exceptions, audit
Branch-scoped data access (BranchScopeGuard)
Gaps / incomplete items
Item	Notes
Insurance settings UI
Backend at settings/insurance; in RBAC catalog; no frontend route/page
/club/subscriptions/member-form
Printable financial lookup only — not member creation
Legacy departments table
In schema but unused; org uses hr_edarat_aqsam
RBAC route vs API mismatch
employees.new is a separate catalog route; API create uses employees.list:create
Employee edit route
/employees/:id/edit shares form with new; no separate employees.edit RBAC page — guarded via employees.list:view + update permission on API
Legacy permissions
Old pages/permissions tables coexist; new work should use RBAC
Some NotImplemented fallbacks
Frontend pages (e.g. branches) show setup-pending UI on 501 — defensive, not necessarily missing
If you're planning new work
Add member: extend club/members.tsx dialog or add a dedicated /club/members/new route — backend DTO/service already support full create.
Branch hierarchy: backend supports parentId on branches; frontend form currently hardcodes parentId: 0.
Department management: full tree + job titles CRUD exists; wire any missing validations or UI polish only.
Employee onboarding: form + auto user + RBAC role assignment is complete; focus on any missing lookup fields or reporting.
System admin: roles/exceptions/users/audit are built; insurance settings page is the clearest missing piece in settings.
Quick Reference: Key File Paths
frontend/src/app/router.tsx          # All routes
frontend/src/lib/nav.ts              # Sidebar structure
frontend/src/hooks/use-permission.ts # Client RBAC
frontend/src/pages/org/              # Branches, departments
frontend/src/pages/employees/        # Employee list/form/profile
frontend/src/pages/club/members.tsx  # Add/edit member (dialog)
frontend/src/pages/club/member-form.tsx  # Financial print form (lookup)
frontend/src/pages/admin/            # Roles, exceptions, audit
backend/prisma/schema.prisma         # All DB models
backend/src/modules/rbac/            # Permission system
backend/src/modules/org/             # Departments + job titles
backend/src/modules/branches/        # Branch CRUD
backend/src/modules/employees/       # Employee CRUD + provisioning
backend/src/modules/club-members/    # Member CRUD
backend/src/modules/users/           # System users
backend/src/modules/sales/           # POS/sales