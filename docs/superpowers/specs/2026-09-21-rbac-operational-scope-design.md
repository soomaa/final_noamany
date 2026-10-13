# RBAC and operational-scope design

## Purpose

Make the Noamany permission system the single, auditable source of access
control. A user's effective access must be determined by their assigned roles,
explicit user exceptions, and the operating area they are allowed to see.

This is phase 1 of the agreed safe delivery sequence. Later phases will activate
existing procurement and sales screens, improve HR reports, and improve data
exports. External email, SMS, and WhatsApp delivery are explicitly out of
scope; in-app notifications remain in place.

## Agreed access rule

Every gender-specific operational record is constrained by two dimensions:

1. Branch.
2. Operating section within that branch, initially `women` or `men`.

A staff member assigned to the women's section must not see, search, export,
create, update, or delete operational data belonging to the men's section in
the same branch. The inverse rule also applies.

An administrator may grant an explicit, audited exception giving a named user
access to both sections. The exception can have a reason and an expiry. System
administrators retain their existing full-access bypass. Shared records that do
not belong to either section, such as payment-method settings and shared
legal/configuration data, are controlled solely by their page/action
permission; they are not gender-filtered.

## Single authorization model

The existing RBAC roles, role permissions, role assignments, and user
exceptions become the only editable authorization model.

- Roles provide base permissions.
- Explicit user exceptions add or deny narrowly scoped permissions.
- An effective deny continues to override an allow.
- Expired role assignments and expired exceptions do not grant access.
- The legacy per-user checkbox permission editor is removed from the user
  management interface and its legacy mutation endpoint is retired or made
  read-only after migration.
- Existing job-title-to-role synchronization remains supported, but does not
  overwrite an explicit user exception.

## Operational-scope model

Extend effective authorization with a scope resolver that returns one of:

- `all`: both sections and all authorized branches.
- `assigned`: the user's assigned branch and assigned section(s).
- `exception`: the normal assigned scope plus a recorded cross-section grant.

Roles grant what a person may do. Scope grants where they may do it. A role
that can view members, for example, never bypasses section filtering by itself.

All list, detail, mutation, aggregate, and export paths that expose
gender-specific operational data must consume the scope resolver. Shared data
receives its normal RBAC page/action check only. Requests that supply another branch or
section identifier are rejected; requests without one are filtered on the
server. The client may hide unavailable choices, but client-side hiding is not
security.

## Administration experience

Provide a coherent administration flow:

- Role management: create, edit, clone, disable, and inspect roles and their
  permission matrix.
- User access: assign one or more roles, show the effective permissions,
  assigned branch and section scope, and current/expired exceptions.
- User exceptions: grant, change, revoke, and expire a cross-section exception
  with a mandatory reason.
- Audit: record role changes, role assignment changes, scope changes, and
  exception changes with actor, target, before/after values, reason, and time.

The interface must clearly distinguish a temporary individual exception from a
permanent role assignment.

## Controller protection

Controllers serving sensitive operations must declare permissions from the
RBAC catalog rather than relying only on authentication. This includes at least
activities, customer service, daily reports, initiatives, legal files, and
payment methods. Self-service endpoints, such as the current user's profile
and notifications, retain narrowly scoped ownership checks rather than a broad
administrative permission.

New or missing catalog keys are named by domain and action, use the existing
catalog conventions, and are tested at the controller boundary.

## Data and migration

Use the existing role-assignment and exception tables where possible. Add only
the fields or relations required to represent a user's default operating
section and an exception's additional section scope. Do not duplicate a second
permissions table.

Migration steps:

1. Preserve existing roles, assignments, permissions, and audit history.
2. Map each active employee/user to a branch and section before enforcement.
3. Treat users without a resolved section as denied for gender-specific operational data,
   except system administrators, and surface them in an administration report.
4. Stop writes to legacy permissions after validation, then remove its UI.

## Error handling

Access failures return the existing authorization response shape without
revealing the existence or values of data in another branch or section.
Failed exception changes, invalid section combinations, and attempts to grant
more access than the actor holds are rejected and audited. Permission and scope
caches are invalidated after every relevant change.

## Verification

Automated tests must prove all of the following:

- A women's-section employee cannot read, mutate, aggregate, or export
  men's-section data in the same branch.
- The same employee can work with their own section's data.
- An explicit active cross-section exception grants the second section only;
  expiry or revocation removes it.
- Permission denial wins where an allow and deny conflict.
- Sensitive controller actions reject an authenticated user without the
  relevant RBAC permission.
- Legacy permission mutation cannot create a second effective authorization
  path.
- An audit record is created for every role, scope, and exception change.

## Non-goals for this phase

- External notification delivery by email, SMS, or WhatsApp.
- Database/server backup automation.
- New procurement/sales business logic or report layouts; these are separate
  later phases after this security foundation is complete.
