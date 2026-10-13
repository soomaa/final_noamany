import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const taskDbUrl=new URL(process.env.DATABASE_URL);
taskDbUrl.searchParams.set('connection_limit','1');
taskDbUrl.searchParams.set('pool_timeout','120');
const db=new PrismaClient({datasources:{db:{url:taskDbUrl.toString()}},errorFormat:'minimal'});
const source = 'migration_trial_gym_20261007';
const sourceKey = 'noamanycenter_noamany:06f7dadd2176894a';
const targetUrl = new URL(process.env.DATABASE_URL);
const target = decodeURIComponent(targetUrl.pathname.slice(1));
if (target !== 'noamany_final_new' || !['127.0.0.1', 'localhost'].includes(targetUrl.hostname))
  throw new Error('Archive import accepts local noamany_final_new only');
const tables = [
  'tbl_subscription_settings', 'tbl_members', 'tbl_subscription_members',
  'tbl_stopped_subscription', 'tbl_subscription_hadback', 'tbl_transformation',
  'tbl_locker_types', 'tbl_locker_types_values', 'tbl_locker_number',
  'tbl_locker_subscription', 'tbl_inbody', 'tbl_inbody_details',
  'tbl_members_imgs', 'tbl_locker_inventory',
  'tbl_invitations', 'tbl_offers', 'tbl_offers_favorites',
  'tbl_member_contacts_sub', 'tbl_members_blocked',
  'tbl_store_captain_discounts',
  'tbl_points_setting', 'tbl_convert_points_setting', 'tbl_points_history',
  'tbl_points_exhausted_history', 'tbl_discount_codes',
  'tbl_discount_cobones_employees', 'tbl_emps_members_dis_codes',
  'tbl_cobon_exhausted_history',
];
const quote = s => {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(s)) throw new Error('Unsafe SQL identifier');
  return String.fromCharCode(96) + s + String.fromCharCode(96);
};
const literal = s => "'" + s.replaceAll("'", "''") + "'";
const count = async (client, sql) => Number((await client.$queryRawUnsafe(sql))[0].n);
const archive = 'legacy_gym_source_records';

try {
  const placeholders = tables.map(() => '?').join(',');
  const tableRows = await db.$queryRawUnsafe(
    'SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_name IN (' +
    placeholders + ')', source, ...tables);
  if (tableRows.length !== tables.length)
    throw new Error('Source table missing: ' + tables.filter(t => !tableRows.some(x => x.table_name === t)).join(','));
  const cols = await db.$queryRawUnsafe(
    'SELECT table_name,column_name,data_type,ordinal_position FROM information_schema.columns WHERE table_schema=? AND table_name IN (' +
    placeholders + ') ORDER BY table_name,ordinal_position', source, ...tables);
  const keys = await db.$queryRawUnsafe(
    "SELECT table_name,column_name FROM information_schema.key_column_usage WHERE table_schema=? AND constraint_name='PRIMARY' AND table_name IN (" +
    placeholders + ') ORDER BY table_name,ordinal_position', source, ...tables);
  const metadata = new Map();
  const sourceCounts = {};
  for (const name of tables) {
    const columns = cols.filter(c => c.table_name === name);
    const pk = keys.filter(k => k.table_name === name);
    if (!columns.length || pk.length !== 1) throw new Error(name + ' needs exactly one primary key');
    if (columns.some(c => /^(blob|tinyblob|mediumblob|longblob|binary|varbinary|geometry|point|linestring|polygon)$/.test(c.data_type)))
      throw new Error(name + ' contains binary columns; add exact HEX encoding before import');
    metadata.set(name, { columns, pk: pk[0].column_name });
    sourceCounts[name] = await count(db, 'SELECT COUNT(*) n FROM ' + quote(source) + '.' + quote(name));
  }
  const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0);
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'dry-run', source, target, archive, tables: sourceCounts, total }));
    process.exit(0);
  }
  await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS ' + quote(archive) + ' (' +
    'source_key varchar(191) NOT NULL,' +
    'legacy_table varchar(100) NOT NULL,' +
    'legacy_id varchar(100) NOT NULL,' +
    'payload longtext NOT NULL,' +
    'imported_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
    'PRIMARY KEY (source_key,legacy_table,legacy_id),' +
    'KEY idx_legacy_gym_source_records_table_id (legacy_table,legacy_id),' +
    'CONSTRAINT chk_legacy_gym_source_records_json CHECK (JSON_VALID(payload))' +
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  const existing = await db.$queryRawUnsafe(
    'SELECT column_name FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position',
    target, archive);
  const expected = ['source_key', 'legacy_table', 'legacy_id', 'payload', 'imported_at'];
  if (existing.map(x => x.column_name).join(',') !== expected.join(','))
    throw new Error('Archive target schema differs from expected model');
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('DELETE FROM ' + quote(archive) +
      ' WHERE source_key=' + literal(sourceKey) + ' AND legacy_table IN (' + tables.map(literal).join(',') + ')');
    for (const name of tables) {
      const { columns, pk } = metadata.get(name);
      const fields = columns.flatMap(c => [
        literal(c.column_name),
        'IF(s.' + quote(c.column_name) + ' IS NULL,NULL,CAST(s.' + quote(c.column_name) + ' AS CHAR))',
      ]);
      const sql = 'INSERT INTO ' + quote(archive) + ' (source_key,legacy_table,legacy_id,payload) ' +
        'SELECT ' + literal(sourceKey) + ',' + literal(name) + ',CAST(s.' + quote(pk) + ' AS CHAR),' +
        'JSON_OBJECT(' + fields.join(',') + ') FROM ' + quote(source) + '.' + quote(name) + ' s';
      await tx.$executeRawUnsafe(sql);
      console.log('Archived '+name+': '+sourceCounts[name]);
      const actual = await count(tx, 'SELECT COUNT(*) n FROM ' + quote(archive) +
        ' WHERE source_key=' + literal(sourceKey) + ' AND legacy_table=' + literal(name));
      if (actual !== sourceCounts[name])
        throw new Error(name + ' archived ' + actual + ' != source ' + sourceCounts[name]);
    }
    const invalid = await count(tx, 'SELECT COUNT(*) n FROM ' + quote(archive) +
      ' WHERE source_key=' + literal(sourceKey) + ' AND legacy_table IN (' +
      tables.map(literal).join(',') + ') AND JSON_VALID(payload)=0');
    if (invalid) throw new Error('Invalid archived JSON rows: ' + invalid);
  }, { maxWait: 30000, timeout: 3600000 });
  console.log(JSON.stringify({ status: 'source rows archived', tables: tables.length, total, sourceCounts }));
} finally {
  await db.$disconnect();
}

