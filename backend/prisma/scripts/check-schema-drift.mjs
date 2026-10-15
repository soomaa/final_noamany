import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function occurrenceCount(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

export function classifyPrismaDiff(sql) {
  const statements = sql.match(/^\s*(?:CREATE|ALTER|DROP|RENAME)\b[\s\S]*?;/gim) ?? [];
  const destructive = {
    dropTable: occurrenceCount(sql, /\bDROP\s+TABLE\b/gi),
    dropColumn: occurrenceCount(sql, /\bDROP\s+COLUMN\b/gi),
    dropIndex: occurrenceCount(sql, /\bDROP\s+INDEX\b/gi),
    dropForeignKey: occurrenceCount(sql, /\bDROP\s+FOREIGN\s+KEY\b/gi),
  };
  const isDestructive = Object.values(destructive).some((count) => count > 0);
  return {
    hasDrift: statements.length > 0,
    isDestructive,
    statementCount: statements.length,
    destructive,
  };
}

export function redactDatasourceUrls(value) {
  return value.replace(/\b(?:mysql):\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]');
}

function main() {
  const prismaBin = resolve(process.cwd(), 'node_modules', '.bin', 'prisma');
  const schemaPath = resolve(process.cwd(), 'prisma', 'schema.prisma');
  const result = spawnSync(
    prismaBin,
    [
      'migrate',
      'diff',
      '--from-schema-datasource',
      schemaPath,
      '--to-schema-datamodel',
      schemaPath,
      '--script',
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = redactDatasourceUrls(result.stderr || result.stdout || 'Prisma diff failed');
    throw new Error(detail.trim());
  }

  const classification = classifyPrismaDiff(result.stdout);
  process.stdout.write(`${JSON.stringify(classification)}\n`);
  if (classification.isDestructive) process.exitCode = 3;
  else if (classification.hasDrift) process.exitCode = 2;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'schema drift check failed';
    process.stderr.write(`${redactDatasourceUrls(message)}\n`);
    process.exitCode = 1;
  }
}
