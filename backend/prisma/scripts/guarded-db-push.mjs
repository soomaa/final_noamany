import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function parseGuardedDbPushMode(args) {
  if (args.length === 0) return 'push';
  if (args.length === 1 && args[0] === '--reseed') return 'reseed';
  throw new Error('unsupported guarded db push arguments');
}

export function assertDbPushAllowed({ allowFlag, nodeEnv, databaseUrl }) {
  if (allowFlag !== 'local-only') {
    throw new Error('ALLOW_PRISMA_DB_PUSH=local-only is required');
  }
  if (nodeEnv === 'production') {
    throw new Error('db push is forbidden in production');
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const url = new URL(databaseUrl);
  if (url.protocol !== 'mysql:') {
    throw new Error('guarded db push requires a MySQL DATABASE_URL');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('database host must be loopback');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  if (!/_(?:dev|e2e)$/.test(databaseName)) {
    throw new Error('database name must end in _dev or _e2e');
  }

  return { databaseName, host: url.hostname };
}

function runLocalBinary(binary, args) {
  const result = spawnSync(binary, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${binary.split('/').pop()} exited with code ${result.status ?? 1}`);
  }
}

function main() {
  const mode = parseGuardedDbPushMode(process.argv.slice(2));
  const allowed = assertDbPushAllowed({
    allowFlag: process.env.ALLOW_PRISMA_DB_PUSH,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });
  process.stdout.write(
    `Guarded Prisma ${mode} approved for ${allowed.databaseName} on ${allowed.host}\n`,
  );

  const prismaBin = resolve(process.cwd(), 'node_modules', '.bin', 'prisma');
  if (mode === 'push') {
    runLocalBinary(prismaBin, ['db', 'push']);
    return;
  }

  runLocalBinary(prismaBin, ['db', 'push', '--force-reset', '--accept-data-loss']);
  const tsxBin = resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
  runLocalBinary(tsxBin, ['prisma/seed.ts']);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'guarded db push failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
