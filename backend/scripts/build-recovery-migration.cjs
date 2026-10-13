// Generate an additive candidate from the verified dump/Prisma contract.
// This script only writes review files. It never executes SQL.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../output/recovery-20261001');
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'dump-contract.json')));
const expected = fs.readFileSync(path.join(dir, 'expected-schema.sql'), 'utf8');
const definitions = new Map([...expected.matchAll(/CREATE TABLE `([^`]+)` \([\s\S]*?\) DEFAULT CHARACTER SET[^;]+;/g)].map(m => [m[1], m[0]]));
const lines = ['-- Additive recovery candidate. Review and isolated DB tests required.', '-- No DROP, DELETE, TRUNCATE, seed, or role reassignment statements.'];
// Legacy tables contain zero-date defaults. Permit their unchanged defaults
// during ADD COLUMN, without weakening strict numeric/string checks globally.
lines.push('SET @recovery_previous_sql_mode = @@SESSION.sql_mode;');
lines.push("SET SESSION sql_mode = TRIM(BOTH ',' FROM REPLACE(REPLACE(CONCAT(',', @@SESSION.sql_mode, ','), ',NO_ZERO_DATE,', ','), ',NO_ZERO_IN_DATE,', ','));");
function guardedAdd(table, column, definition) {
  const statement = `ALTER TABLE \`${table}\` ADD COLUMN ${definition}`;
  return [
    `SET @recovery_sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME='${column}'), 'SELECT 1', '${statement.replace(/'/g, "''")}');`,
    'PREPARE recovery_stmt FROM @recovery_sql;', 'EXECUTE recovery_stmt;', 'DEALLOCATE PREPARE recovery_stmt;'
  ].join('\n');
}
for (const table of plan.missingTables) {
  const ddl = definitions.get(table);
  if (!ddl) throw new Error('No expected definition for ' + table);
  lines.push(ddl.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '));
}
const followUps = [];
for (const field of plan.missingColumns) {
  const ddl = definitions.get(field.table);
  const match = ddl && ddl.split(/\r?\n/).find(l => l.trim().startsWith('`' + field.column + '` '));
  if (!match) throw new Error('No expected column for ' + field.table + '.' + field.column);
  let definition = match.trim().replace(/,$/, '');
  // Old online request writers populate the legacy fields, not snapshot fields.
  if (field.table === 'online_subscription_requests' && !/\bDEFAULT\b/.test(definition)) definition = definition.replace(' NOT NULL', ' NULL');
  // Backfill the renamed lead identity from the preserved legacy name.
  if (field.table === 'club_leads' && ['full_name', 'source'].includes(field.column)) {
    const nullable = definition.replace(' NOT NULL', ' NULL');
    lines.push(guardedAdd(field.table, field.column, nullable));
    followUps.push(field.column === 'full_name'
      ? 'UPDATE `club_leads` SET `full_name`=`name` WHERE `full_name` IS NULL;'
      : "UPDATE `club_leads` SET `source`='legacy' WHERE `source` IS NULL;");
    followUps.push('ALTER TABLE `club_leads` MODIFY COLUMN ' + definition + ';');
    continue;
  }
  if (field.required && /\bNOT NULL\b/.test(definition) && !/\bDEFAULT\b/.test(definition)) throw new Error('Required column needs an explicit reviewed backfill: ' + field.table + '.' + field.column);
  lines.push(guardedAdd(field.table, field.column, definition));
}
lines.push(...followUps);
const addedByTable = new Map();
for (const f of plan.missingColumns) {
  if (!addedByTable.has(f.table)) addedByTable.set(f.table, new Set());
  addedByTable.get(f.table).add(f.column);
}
for (const [table, fields] of addedByTable) {
  const ddl = definitions.get(table);
  for (const match of ddl.matchAll(/^\s*((?:UNIQUE )?INDEX `([^`]+)`\(([^\n]+)\)),?$/gm)) {
    if (![...fields].some(f => match[3].includes('`' + f + '`'))) continue;
    const statement = `ALTER TABLE \`${table}\` ADD ${match[1]}`;
    lines.push(`SET @recovery_sql = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND INDEX_NAME='${match[2]}'), 'SELECT 1', '${statement.replace(/'/g, "''")}');\nPREPARE recovery_stmt FROM @recovery_sql;\nEXECUTE recovery_stmt;\nDEALLOCATE PREPARE recovery_stmt;`);
  }
}
// An unknown legacy timestamp is NULL, never a fabricated valid date.
lines.push('ALTER TABLE `global_settings` MODIFY COLUMN `updated_at` DATETIME NULL DEFAULT NULL;');
lines.push("UPDATE `global_settings` SET `updated_at`=NULL WHERE SUBSTRING(CAST(`updated_at` AS CHAR),1,4)='0000' OR SUBSTRING(CAST(`updated_at` AS CHAR),6,2)='00' OR SUBSTRING(CAST(`updated_at` AS CHAR),9,2)='00';");
lines.push('SET SESSION sql_mode = @recovery_previous_sql_mode;');
const script = lines.join('\n\n') + '\n';
if (/\b(DROP|DELETE|TRUNCATE)\s+(TABLE|DATABASE|FROM)\b/i.test(script)) throw new Error('Destructive SQL is forbidden in additive recovery');
fs.writeFileSync(path.join(dir, 'additive-recovery-candidate.sql'), script);
if (process.argv.includes('--promote')) {
  const destination = path.resolve(__dirname, '../prisma/migrations/20261001120000_recovery_application_contract/migration.sql');
  if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') !== script) throw new Error('Refusing to alter an existing migration');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, script);
}
console.log(JSON.stringify({ createTables: plan.missingTables.length, addColumns: plan.missingColumns.length, bytes: Buffer.byteLength(script), executed: false }));
