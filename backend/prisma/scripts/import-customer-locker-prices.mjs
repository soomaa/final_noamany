import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const source = 'migration_trial_gym_20261007';
const key = 'noamanycenter_noamany:06f7dadd2176894a';
const target = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
if (target !== 'noamany_final_new') throw new Error('Unexpected target database');

try {
  const sourceRows = Number((await p.$queryRawUnsafe(`SELECT COUNT(*) n FROM \`${source}\`.tbl_locker_types_values`))[0].n);
  if (sourceRows !== 30) throw new Error(`Expected 30 source locker prices, found ${sourceRows}`);
  const unresolved = Number((await p.$queryRawUnsafe(`
    SELECT COUNT(*) n FROM \`${source}\`.tbl_locker_types_values v
    LEFT JOIN legacy_branch_mappings bm ON bm.source_key=? AND bm.legacy_id=v.branch_id
    LEFT JOIN legacy_record_mappings tm ON tm.source_key=? AND tm.legacy_table='tbl_locker_types'
      AND tm.legacy_id=CAST(v.locker_type_id_fk AS CHAR) COLLATE utf8mb4_unicode_ci AND tm.target_table='club_locker_subscription_types'
    WHERE bm.new_branch_id IS NULL OR tm.target_id IS NULL`, key, key))[0].n);
  if (unresolved) throw new Error(`${unresolved} locker prices have no canonical type or branch mapping`);
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ target, source, table: 'club_locker_type_branch_prices', rows: sourceRows, unresolved, mode: 'dry-run' }));
    process.exit(0);
  }
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS club_locker_type_branch_prices (
    id INT NOT NULL PRIMARY KEY,
    subscription_type_id INT NOT NULL,
    source_locker_type_id INT NOT NULL,
    branch_id INT NOT NULL,
    source_branch_id INT NOT NULL,
    source_branch_name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_locker_type_branch_price (subscription_type_id, branch_id),
    KEY idx_locker_type_price_branch (branch_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('DELETE FROM club_locker_type_branch_prices');
    await tx.$executeRawUnsafe(`INSERT INTO club_locker_type_branch_prices
      (id,subscription_type_id,source_locker_type_id,branch_id,source_branch_id,source_branch_name,price)
      SELECT v.id,tm.target_id,v.locker_type_id_fk,bm.new_branch_id,v.branch_id,v.branch_name,v.value
      FROM \`${source}\`.tbl_locker_types_values v
      JOIN legacy_branch_mappings bm ON bm.source_key=? AND bm.legacy_id=v.branch_id
      JOIN legacy_record_mappings tm ON tm.source_key=? AND tm.legacy_table='tbl_locker_types'
        AND tm.legacy_id=CAST(v.locker_type_id_fk AS CHAR) COLLATE utf8mb4_unicode_ci AND tm.target_table='club_locker_subscription_types'`, key, key);
    const count = Number((await tx.$queryRawUnsafe('SELECT COUNT(*) n FROM club_locker_type_branch_prices'))[0].n);
    if (count !== 30) throw new Error(`Imported ${count} of 30 locker prices`);
  }, { maxWait: 30000, timeout: 120000 });
  console.log('Imported and verified 30 branch-specific locker package prices');
} finally {
  await p.$disconnect();
}

