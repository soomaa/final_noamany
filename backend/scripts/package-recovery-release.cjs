const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const workspace = path.dirname(root);
const checks = path.join(workspace, 'output/recovery-20261001');
const before = JSON.parse(fs.readFileSync(path.join(checks, 'database-audit-before.json')));
const after = JSON.parse(fs.readFileSync(path.join(checks, 'database-audit-after.json')));
const reads = JSON.parse(fs.readFileSync(path.join(checks, 'read-tests.json')));
const units = JSON.parse(fs.readFileSync(path.join(checks, 'unit-tests.json')));
if (after.missingTables.length || after.missingColumns.length || after.modelReadFailures.length || after.autoIncrementDifferences.length || reads.failed || units.numFailedTests || !units.success) throw new Error('Recovery release is not fully verified');
if (JSON.stringify(before.counts) !== JSON.stringify(after.counts)) throw new Error('Business row counts changed during additive migration');
if (JSON.stringify(before.permissionFingerprints) !== JSON.stringify(after.permissionFingerprints)) throw new Error('Restored role/exception assignments changed');
const name = 'noamany-recovery-release-20261001-r1';
const stage = path.join(workspace, 'release', name);
if (fs.existsSync(stage)) throw new Error('Release staging already exists; refusing to overwrite');
fs.mkdirSync(stage, { recursive: true });
for (const file of ['package.json','package-lock.json','tsconfig.json','tsconfig.build.json','nest-cli.json']) fs.copyFileSync(path.join(root, file), path.join(stage, file));
fs.cpSync(path.join(root, '.recovery-verified-dist'), path.join(stage, 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'src'), path.join(stage, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'prisma/schema.prisma'), path.join(stage, 'prisma/schema.prisma'), { recursive: true });
fs.cpSync(path.join(root, 'prisma/migrations'), path.join(stage, 'prisma/migrations'), { recursive: true });
const admin = path.join(workspace, 'frontend/dist');
const website = path.join(workspace, 'website-redesign/dist');
fs.cpSync(admin, path.join(stage, 'public'), { recursive: true });
fs.renameSync(path.join(stage, 'public/index.html'), path.join(stage, 'public/system.html'));
fs.cpSync(website, path.join(stage, 'public'), { recursive: true });
fs.mkdirSync(path.join(stage, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(root, 'scripts/recovery-read-tests.cjs'), path.join(stage, 'scripts/recovery-read-tests.cjs'));
fs.mkdirSync(path.join(stage, 'verification'), { recursive: true });
const result = { backupSha256: JSON.parse(fs.readFileSync(path.join(checks, 'backup-inspection.json'))).sha256,
  unitTests: units.numPassedTests, unitSuites: units.numPassedTestSuites, modelReadFailures: after.modelReadFailures.length,
  serviceReads: reads.passed, businessCounts: after.counts, permissionsUnchanged: true,
  testedDatabase: 'local isolated MariaDB 10.4; production is MySQL 8.0', productionVerified: false };
fs.writeFileSync(path.join(stage, 'verification/results.json'), JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(stage, 'DEPLOY-NOTES.txt'), [
  'This package does not restore production automatically.',
  'Use the original September 30 full backup. It is NOT the September 29 backup.',
  'Before any production restore: stop application writes and capture a new full database backup and code/.env/uploads snapshot.',
  'Restoring September 30 replaces later writes. Explicit cutover approval is required.',
  'Do not run db push, reset, migration healing/resolve, or RBAC/demo seeds.',
  'Install dependencies, validate and generate Prisma, then apply pending migrations with migrate deploy.',
  'Prisma migrate status alone does not prove physical schema compatibility.',
  'Read-only verification: node scripts/recovery-read-tests.cjs --configured-database',
  'Do not expose .env, SQL backups, or verification data to public HTTP paths.',
  'Preserve existing server .env, uploads, Apache/cPanel configuration, and PM2 process configuration.',
  'Local checks passed; authenticated production browser checks are still required.',
].join('\n') + '\n');
const manifest = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else manifest.push({ path: path.relative(stage, file).replace(/\\/g, '/'), bytes: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  }
}
walk(stage);
if (manifest.some(f => /(^|\/)\.env($|\.)|\.sql\.gz$|(^|\/)node_modules\//.test(f.path))) throw new Error('Private/runtime files unexpectedly entered the release');
fs.writeFileSync(path.join(stage, 'verification/manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ stage, files: manifest.length, result }));
