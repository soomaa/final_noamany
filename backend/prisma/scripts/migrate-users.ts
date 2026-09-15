/* eslint-disable no-console */
/**
 * User-only migration from legacy users into canonical users.
 *
 * Usage:
 *   npm run db:migrate:users
 *   npm run db:migrate:users -- --dry-run
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  comparableDatabaseUrl,
  requireEnv,
  resolveLegacyUrl,
} from './employee-migration.shared';
import {
  buildUserTransformContext,
  normalizeUsername,
  readLegacyUsers,
  transformUser,
  userSourceKey,
  validateLegacyUsers,
} from './user-migration.shared';

interface Stats {
  found: number;
  created: number;
  linkedToExisting: number;
  skippedMapped: number;
  credentialsBackfilled: number;
  mappingsCreated: number;
  warnings: number;
}

interface Event {
  type: 'created' | 'linked' | 'skipped' | 'credentials-backfilled';
  legacyId: number;
  newId: number;
  username: string;
}

class DryRunRollback extends Error {
  constructor(
    readonly stats: Stats,
    readonly events: Event[],
    readonly warnings: string[],
  ) {
    super('Dry-run rollback requested');
  }
}

function printSummary(stats: Stats, errors: number): void {
  console.log('\n=== User migration summary ===');
  console.log(`Users found:             ${stats.found}`);
  console.log(`Users migrated/created:  ${stats.created}`);
  console.log(`Duplicates linked safely:${stats.linkedToExisting}`);
  console.log(`Users skipped (mapped):  ${stats.skippedMapped}`);
  console.log(`Credentials backfilled:  ${stats.credentialsBackfilled}`);
  console.log(`Mapping rows created:    ${stats.mappingsCreated}`);
  console.log(`Warnings:                ${stats.warnings}`);
  console.log(`Errors:                  ${errors}`);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const targetUrl = requireEnv('DATABASE_URL');
  const legacyUrl = resolveLegacyUrl(targetUrl);
  if (comparableDatabaseUrl(targetUrl) === comparableDatabaseUrl(legacyUrl)) {
    throw new Error('Legacy and target database URLs point to the same database');
  }
  const key = userSourceKey(legacyUrl);
  const target = new PrismaClient();
  const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl } } });
  let found = 0;

  try {
    console.log(`=== User migration (${dryRun ? 'DRY RUN' : 'COMMIT'}) ===`);
    console.log(`Legacy source: ${key}`);
    const rows = await readLegacyUsers(legacy);
    found = rows.length;
    console.log(`Users found: ${found}`);
    validateLegacyUsers(rows);

    const result = await target.$transaction(
      async (tx) => {
        const stats: Stats = {
          found,
          created: 0,
          linkedToExisting: 0,
          skippedMapped: 0,
          credentialsBackfilled: 0,
          mappingsCreated: 0,
          warnings: 0,
        };
        const events: Event[] = [];
        const warnings: string[] = [];
        const context = await buildUserTransformContext(tx, key);
        const existingMappings = await tx.legacy_user_mappings.findMany({
          where: { source_key: key },
          select: { legacy_id: true, new_user_id: true },
        });
        const mappingByLegacyId = new Map(
          existingMappings.map((item) => [item.legacy_id, item.new_user_id]),
        );
        const existingUsers = await tx.users.findMany({
          select: { user_id: true, username: true },
        });
        const usersByUsername = new Map<string, Array<{ user_id: number; username: string | null }>>();
        for (const user of existingUsers) {
          const normalized = normalizeUsername(user.username);
          if (!normalized) continue;
          const group = usersByUsername.get(normalized) ?? [];
          group.push(user);
          usersByUsername.set(normalized, group);
        }

        for (const row of rows) {
          const username = String(row.username ?? '').trim();
          const mappedTargetId = mappingByLegacyId.get(row.user_id);
          if (mappedTargetId != null) {
            const mapped = await tx.users.findUnique({
              where: { user_id: mappedTargetId },
              select: { user_id: true, username: true, password: true, x_y_z: true },
            });
            if (!mapped) {
              throw new Error(
                `Mapping for legacy user ${row.user_id} points to missing target user ${mappedTargetId}`,
              );
            }
            if (normalizeUsername(mapped.username) !== normalizeUsername(username)) {
              throw new Error(`Mapped username mismatch for legacy user ${row.user_id}`);
            }
            const legacyClearText = String(row.x_y_z ?? '').trim();
            if (
              legacyClearText &&
              mapped.x_y_z == null &&
              mapped.password === String(row.password ?? '').trim()
            ) {
              await tx.users.update({
                where: { user_id: mapped.user_id },
                data: { x_y_z: legacyClearText.slice(0, 300) },
              });
              stats.credentialsBackfilled += 1;
              events.push({
                type: 'credentials-backfilled',
                legacyId: row.user_id,
                newId: mapped.user_id,
                username,
              });
            } else {
              stats.skippedMapped += 1;
              events.push({ type: 'skipped', legacyId: row.user_id, newId: mapped.user_id, username });
            }
            continue;
          }

          const transformed = transformUser(row, context);
          warnings.push(...transformed.warnings);
          const duplicates = usersByUsername.get(normalizeUsername(username)) ?? [];
          if (duplicates.length > 1) {
            throw new Error(`Multiple target users already use username="${username}"`);
          }

          let targetId: number;
          let eventType: Event['type'];
          if (duplicates.length === 1) {
            targetId = duplicates[0].user_id;
            eventType = 'linked';
            stats.linkedToExisting += 1;
          } else {
            const created = await tx.users.create({
              data: transformed.data,
              select: { user_id: true, username: true },
            });
            targetId = created.user_id;
            eventType = 'created';
            stats.created += 1;
            usersByUsername.set(normalizeUsername(username), [created]);
          }

          await tx.legacy_user_mappings.create({
            data: {
              source_key: key,
              legacy_id: row.user_id,
              new_user_id: targetId,
              username: username.slice(0, 40),
            },
          });
          stats.mappingsCreated += 1;
          events.push({ type: eventType, legacyId: row.user_id, newId: targetId, username });
        }

        stats.warnings = warnings.length;
        if (dryRun) throw new DryRunRollback(stats, events, warnings);
        return { stats, events, warnings };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    for (const event of result.events) {
      console.log(`[${event.type}] legacy=${event.legacyId} -> new=${event.newId} | ${event.username}`);
    }
    for (const warning of result.warnings) console.warn(`[warning] ${warning}`);
    printSummary(result.stats, 0);
  } catch (error) {
    if (error instanceof DryRunRollback) {
      for (const event of error.events) {
        console.log(`[would-${event.type}] legacy=${event.legacyId} -> new=${event.newId} | ${event.username}`);
      }
      for (const warning of error.warnings) console.warn(`[warning] ${warning}`);
      printSummary(error.stats, 0);
      console.log('Dry run complete: transaction rolled back.');
      return;
    }
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('User migration failed; transaction was rolled back.');
    console.error(message);
    printSummary(
      {
        found,
        created: 0,
        linkedToExisting: 0,
        skippedMapped: 0,
        credentialsBackfilled: 0,
        mappingsCreated: 0,
        warnings: 0,
      },
      1,
    );
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([legacy.$disconnect(), target.$disconnect()]);
  }
}

void main();
