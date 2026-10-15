# Prisma retained-object classification — 2026-08-26

This file records every destructive object reported by the database-to-datamodel diff before the schema reconciliation. No object in this list was dropped.

## Retained legacy tables

The following live tables are represented as `@@ignore` models. Prisma Client does not expose them, but Prisma Migrate now knows they exist and cannot silently propose deleting them:

- `club_approval_items`
- `club_availability_slots`
- `club_branch_visits`
- `club_calls`
- `club_class_rooms`
- `club_closing_transactions`
- `club_commission_rules`
- `club_content_items`
- `club_employee_requests`
- `club_financial_entries`
- `club_free_benefits`
- `club_inbody_bookings`
- `club_invitations`
- `club_leads`
- `club_lookups`
- `club_lost_found`
- `club_machine_maintenance`
- `club_machines`
- `club_one_pass_sessions`
- `club_reminders`
- `club_sales_staff`
- `club_shifts`
- `club_tickets`
- `club_training_notes`
- `club_workouts`

## Retained live columns

The ten live columns previously shown as drops are now mapped in their active models:

- `club_classes.class_type` → `club_classes.legacy_class_type`
- `club_inbody_measurements.file_url`
- `club_inbody_measurements.staff_name`
- `club_members.emergency_name`
- `club_members.emergency_phone`
- `club_members.emergency_relation`
- `club_members.sales_staff_id`
- `club_members.source_id`
- `club_members.trainer_id`
- `club_spa_services.service_kind`

## Retained indexes and foreign keys

The schema now maps all live hot-path indexes reported by the audit across attendance, permissions, finance, subscriptions, receipts, invoices, lockers, quick sales, and café/inventory product linkage. It also matches the current `RESTRICT` semantics of the four member-subscription transfer foreign keys and preserves the maintenance foreign key through the ignored legacy models.

## Remaining non-destructive diff

After reconciliation the destructive counts are all zero. The remaining ten statements are desired objects from unapplied canonical migrations:

- four C3 gate tables;
- four C3 gate foreign keys;
- two member-group foreign keys.

They must be applied only by `prisma migrate deploy` during the disposable rehearsal and then, after backup evidence, to the current database. They are not schema drift to be removed from the datamodel.

