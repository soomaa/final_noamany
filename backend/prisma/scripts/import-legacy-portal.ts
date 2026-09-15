/**
 * Imports the website-portal slice from the legacy phpMyAdmin dump without
 * touching any HR/club/finance table in the new system.
 *
 * Usage: npm run db:import:legacy-portal -- "D:\\path\\dump.sql"
 */
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dump = process.argv[2] ?? 'D:\\asmaa\\old_application_noamany\\noamanycenter_noamany.sql';
const tables = new Set([
  'categories', 'design_web_about', 'design_web_contact_us', 'design_web_job_ads', 'design_web_job_ads_files',
  'design_web_partners', 'design_web_photos', 'design_web_photos_images', 'design_web_slider',
  'design_web_slider_videos', 'design_web_systems', 'design_web_videos', 'product_images', 'products',
  'tbl_badge_settings', 'tbl_store_captain_discounts', 'tbl_offers', 'users_applications', 'web_users', 'orders', 'order_items',
]);

function adapt(table: string, statement: string) {
  let sql = statement.replace(/^INSERT INTO /, 'INSERT IGNORE INTO ');
  if (table === 'design_web_photos' || table === 'design_web_slider_videos') {
    sql = sql.replace('`type`', '`legacy_branch_id`');
  }
  if (table === 'tbl_store_captain_discounts') {
    sql = sql.replace('`captain_id`', '`legacy_captain_id`');
  }
  if (table === 'web_users') {
    sql = sql
      .replace('`نسبة_الخصم`', '`discount_rate`')
      .replace('`تاريخ_البدء`', '`discount_start`')
      .replace('`تاريخ_الانتهاء`', '`discount_end`')
      .replace('`تفعيل_الخصم_للعميل`', '`discount_active`');
  }
  return sql;
}

async function main() {
  if (!existsSync(dump)) throw new Error(`Legacy SQL dump not found: ${dump}`);
  const input = createInterface({ input: createReadStream(dump, { encoding: 'utf8' }), crlfDelay: Infinity });
  let table = '';
  let statement = '';
  const imported: Record<string, number> = {};

  for await (const line of input) {
    if (!statement) {
      const match = line.match(/^INSERT INTO `([^`]+)`/);
      if (!match || !tables.has(match[1])) continue;
      table = match[1];
      statement = line;
    } else {
      statement += `\n${line}`;
    }
    if (!line.trimEnd().endsWith(';')) continue;
    const affected = await prisma.$executeRawUnsafe(adapt(table, statement));
    imported[table] = (imported[table] ?? 0) + affected;
    statement = '';
    table = '';
  }

  const counts: Record<string, number> = {};
  for (const name of tables) {
    const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM \`${name}\``);
    counts[name] = Number(result[0]?.count ?? 0);
  }
  console.log(JSON.stringify({ dump, imported, counts }, null, 2));
}

main().finally(() => prisma.$disconnect());
