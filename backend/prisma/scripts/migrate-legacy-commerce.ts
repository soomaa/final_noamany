/* eslint-disable no-console */
/** Lossless canonical mapping for legacy inventory, Cafe/POS and purchases. */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

type IdRow = { id: number };
const target = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function databaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  if (!name) throw new Error("DATABASE_URL has no database name");
  return name;
}
function ident(value: string): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value))
    throw new Error(`Unsafe database identifier: ${value}`);
  return `\`${value}\``;
}
function lit(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}
async function exec(
  tx: Prisma.TransactionClient,
  sql: string,
): Promise<number> {
  return tx.$executeRawUnsafe(sql);
}
async function one<T>(sql: string): Promise<T> {
  const rows = await target.$queryRawUnsafe<T[]>(sql);
  if (rows.length !== 1)
    throw new Error(`Expected one row, received ${rows.length}`);
  return rows[0];
}
async function step(
  label: string,
  work: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  const started = Date.now();
  console.log(`==> ${label}`);
  await target.$transaction(
    async (tx) => {
      await exec(tx, "SET time_zone='+00:00'");
      await exec(tx, "SET collation_connection='utf8mb4_unicode_ci'");
      await work(tx);
    },
    { maxWait: 30_000, timeout: 1_800_000 },
  );
  console.log(`    ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

async function main(): Promise<void> {
  const targetDatabase = databaseName(required("DATABASE_URL"));
  const sourceDatabase = required("LEGACY_DATABASE");
  const sourceKey = required("LEGACY_SOURCE_KEY");
  const dumpSha = required("LEGACY_DUMP_SHA256").toLowerCase();
  if (sourceDatabase === targetDatabase)
    throw new Error("Legacy and target databases must differ");
  if (!/^[a-f0-9]{64}$/.test(dumpSha))
    throw new Error("LEGACY_DUMP_SHA256 must be 64 hex characters");
  const src = ident(sourceDatabase);
  const key = lit(sourceKey);
  const run = await one<IdRow>(
    `SELECT id FROM legacy_import_runs WHERE source_key=${key} AND dump_sha256=${lit(dumpSha)}`,
  );
  const runId = run.id;
  console.log(`=== Legacy commerce import: run ${runId} ===`);

  await step(
    "441 inventory products plus referenced missing-item placeholders",
    async (tx) => {
      await exec(
        tx,
        `DELETE lm FROM legacy_record_mappings lm LEFT JOIN inv_products t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.target_table='inv_products' AND t.id IS NULL`,
      );
      await exec(
        tx,
        "SET @legacy_product_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_products)",
      );
      await exec(
        tx,
        `
      INSERT INTO inv_products
        (id,product_code,name_ar,description,cost_price,selling_price,unit_of_measure,
         min_stock,reorder_point,inventory_kind,inventory_section,status,is_deleted,created_at,updated_at)
      SELECT @legacy_product_base+s.id,CONCAT('L',s.id,'-',LEFT(s.sanf_code,38)),LEFT(s.name,255),
        JSON_OBJECT('legacy_table','store_item','legacy_id',s.id,'original_code',s.sanf_code,
          'legacy_type',s.sanf_type,'legacy_gym_type',s.sanf_type_gym,'opening_quantity',s.first_balance_period),
        COALESCE(s.one_buy_cost,0),COALESCE(s.sale_price,s.customer_price_sale,0),LEFT(COALESCE(NULLIF(s.unit,''),'وحدة'),50),
        COALESCE(CAST(NULLIF(s.min_limit,'') AS DECIMAL(14,3)),0),
        COALESCE(CAST(NULLIF(s.limit_order,'') AS DECIMAL(14,3)),0),'cafe','cafe','active',0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM ${src}.store_item s LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_item' AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='inv_products'
      WHERE lm.id IS NULL
    `,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings
      (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'store_item',CAST(s.id AS CHAR),'inv_products',@legacy_product_base+s.id,'mapped',JSON_OBJECT('original_code',s.sanf_code)
      FROM ${src}.store_item s LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_item' AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='inv_products'
      WHERE lm.id IS NULL`,
      );

      await exec(
        tx,
        "DROP TEMPORARY TABLE IF EXISTS tmp_legacy_orphan_products",
      );
      await exec(
        tx,
        `CREATE TEMPORARY TABLE tmp_legacy_orphan_products AS
      SELECT legacy_key,MAX(item_name) item_name FROM (
        SELECT CONCAT('id:',s.item_id) legacy_key,CONCAT('Missing legacy item ',s.item_id) item_name
        FROM ${src}.bar_sales s LEFT JOIN ${src}.store_item i ON i.id=s.item_id WHERE i.id IS NULL
        UNION ALL
        SELECT CONCAT('id:',b.item_id_fk),CONCAT('Missing legacy item ',b.item_id_fk)
        FROM ${src}.bar_inventory_table b LEFT JOIN ${src}.store_item i ON i.id=b.item_id_fk WHERE i.id IS NULL
        UNION ALL
        SELECT CONCAT('code:',p.product_code),CONCAT('Missing legacy product code ',p.product_code)
        FROM ${src}.store_purchases p LEFT JOIN ${src}.store_item i ON i.sanf_code=p.product_code WHERE i.id IS NULL
        UNION ALL
        SELECT CONCAT('code:',p.product_code),COALESCE(NULLIF(p.product_name,''),CONCAT('Missing legacy product code ',p.product_code))
        FROM ${src}.store_purchases_others p LEFT JOIN ${src}.store_item i ON i.sanf_code=p.product_code WHERE i.id IS NULL
      ) x GROUP BY legacy_key`,
      );
      await exec(
        tx,
        "ALTER TABLE tmp_legacy_orphan_products ADD PRIMARY KEY (legacy_key)",
      );
      await exec(
        tx,
        "SET @legacy_orphan_product_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_products)",
      );
      await exec(
        tx,
        `INSERT INTO inv_products
      (id,product_code,name_ar,description,cost_price,selling_price,unit_of_measure,inventory_kind,inventory_section,status,is_deleted,created_at,updated_at)
      SELECT @legacy_orphan_product_base+ROW_NUMBER() OVER(ORDER BY o.legacy_key),
        CONCAT('LEG-ORPH-',LEFT(REPLACE(o.legacy_key,':','-'),39)),LEFT(o.item_name,255),
        CONCAT('Inactive placeholder for missing source catalog row: ',o.legacy_key),0,0,'وحدة','cafe','cafe','inactive',1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM tmp_legacy_orphan_products o LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='legacy_orphan_products' AND lm.legacy_id=o.legacy_key AND lm.target_table='inv_products'
      WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings
      (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'legacy_orphan_products',o.legacy_key,'inv_products',p.id,'placeholder',JSON_OBJECT('reason','missing store_item row')
      FROM tmp_legacy_orphan_products o JOIN inv_products p ON p.product_code=CONCAT('LEG-ORPH-',LEFT(REPLACE(o.legacy_key,':','-'),39))
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='legacy_orphan_products'
       AND lm.legacy_id=o.legacy_key AND lm.target_table='inv_products' WHERE lm.id IS NULL`,
      );
    },
  );

  await step(
    "complete Cafe catalog linked one-to-one with legacy inventory",
    async (tx) => {
      await exec(
        tx,
        `DELETE lm FROM legacy_record_mappings lm LEFT JOIN cafe_products t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.target_table='cafe_products' AND t.id IS NULL`,
      );

      await exec(
        tx,
        "SET @legacy_cafe_product_base=(SELECT COALESCE(MAX(id),0)+1000 FROM cafe_products)",
      );
      await exec(
        tx,
        `INSERT INTO cafe_products
      (id,product_code,name,product_type,inventory_product_id,sell_price,is_active,created_at,updated_at)
      SELECT @legacy_cafe_product_base+s.id,CONCAT('LEG-CAFE-',s.id),LEFT(s.name,200),
        CASE WHEN s.sanf_type='0' OR s.sanf_type_gym=9 THEN 'internal' ELSE 'ready' END,
        pm.target_id,COALESCE(s.sale_price,s.customer_price_sale,0),s.sanf_type<>'0',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM ${src}.store_item s
      JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item'
       AND pm.legacy_id=CAST(s.id AS CHAR) AND pm.target_table='inv_products'
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_item'
       AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='cafe_products'
      WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings
      (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'store_item',CAST(s.id AS CHAR),'cafe_products',@legacy_cafe_product_base+s.id,'mapped',
        JSON_OBJECT('inventory_product_id',pm.target_id,'legacy_gym_type',s.sanf_type_gym)
      FROM ${src}.store_item s
      JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item'
       AND pm.legacy_id=CAST(s.id AS CHAR) AND pm.target_table='inv_products'
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_item'
       AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='cafe_products'
      WHERE lm.id IS NULL`,
      );

      // Historical lines that referenced a catalog row already missing from the
      // old database get an inactive Cafe placeholder as well as an inventory one.
      await exec(
        tx,
        "SET @legacy_orphan_cafe_base=(SELECT COALESCE(MAX(id),0)+1000 FROM cafe_products)",
      );
      await exec(
        tx,
        `INSERT INTO cafe_products
      (id,product_code,name,product_type,inventory_product_id,sell_price,is_active,created_at,updated_at)
      SELECT @legacy_orphan_cafe_base+ROW_NUMBER() OVER(ORDER BY op.legacy_id),
        CONCAT('LEG-CAFE-ORPH-',op.target_id),LEFT(p.name_ar,200),'ready',op.target_id,COALESCE(p.selling_price,0),0,
        CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM legacy_record_mappings op JOIN inv_products p ON p.id=op.target_id
      LEFT JOIN legacy_record_mappings cm ON cm.source_key=${key} AND cm.legacy_table='legacy_orphan_products'
       AND cm.legacy_id=op.legacy_id AND cm.target_table='cafe_products'
      WHERE op.source_key=${key} AND op.legacy_table='legacy_orphan_products'
       AND op.target_table='inv_products' AND cm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings
      (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'legacy_orphan_products',op.legacy_id,'cafe_products',c.id,'placeholder',
        JSON_OBJECT('reason','missing store_item row','inventory_product_id',op.target_id)
      FROM legacy_record_mappings op
      JOIN cafe_products c ON c.product_code=CONCAT('LEG-CAFE-ORPH-',op.target_id)
      LEFT JOIN legacy_record_mappings cm ON cm.source_key=${key} AND cm.legacy_table='legacy_orphan_products'
       AND cm.legacy_id=op.legacy_id AND cm.target_table='cafe_products'
      WHERE op.source_key=${key} AND op.legacy_table='legacy_orphan_products'
       AND op.target_table='inv_products' AND cm.id IS NULL`,
      );

      // Heal sale lines written by an earlier version of the importer.
      await exec(
        tx,
        `UPDATE sales_quick_sale_items t
      JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='bar_sales'
       AND sm.target_table='sales_quick_sale_items' AND sm.target_id=t.id
      JOIN ${src}.bar_sales s ON s.id=CAST(sm.legacy_id AS UNSIGNED)
      LEFT JOIN legacy_record_mappings cm ON cm.source_key=${key} AND cm.legacy_table='store_item'
       AND cm.legacy_id=CAST(s.item_id AS CHAR) AND cm.target_table='cafe_products'
      LEFT JOIN legacy_record_mappings oc ON oc.source_key=${key} AND oc.legacy_table='legacy_orphan_products'
       AND oc.legacy_id=CONCAT('id:',s.item_id) AND oc.target_table='cafe_products'
      SET t.cafe_product_id=COALESCE(cm.target_id,oc.target_id)
      WHERE t.cafe_product_id IS NULL`,
      );
    },
  );

  await step("five operational warehouses", async (tx) => {
    await exec(
      tx,
      "SET @legacy_wh_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_warehouses)",
    );
    await exec(
      tx,
      `INSERT INTO inv_warehouses
      (id,warehouse_code,name_ar,name_en,type,storage_capacity,branch_id,status,is_deleted,created_at,updated_at)
      SELECT @legacy_wh_base+s.id,CONCAT('LEG-WH-',s.id),LEFT(CONCAT('مخزن ',s.title),150),LEFT(CONCAT('Legacy warehouse ',s.id),150),
        'main',1,bm.new_branch_id,'active',0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM ${src}.store_branch_settings s JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=s.id
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_branch_settings'
       AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='inv_warehouses'
      WHERE s.from_id>0 AND lm.id IS NULL`,
    );
    await exec(
      tx,
      `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'store_branch_settings',CAST(s.id AS CHAR),'inv_warehouses',@legacy_wh_base+s.id
      FROM ${src}.store_branch_settings s LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_branch_settings' AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='inv_warehouses'
      WHERE s.from_id>0 AND lm.id IS NULL`,
    );
  });

  await step(
    "16,068 Cafe/POS invoices, 75,101 lines and payments",
    async (tx) => {
      await exec(
        tx,
        `DELETE lm FROM legacy_record_mappings lm LEFT JOIN sales_quick_sales t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='bar_sales_fatora' AND lm.target_table='sales_quick_sales' AND t.id IS NULL`,
      );
      await exec(
        tx,
        `DELETE lm FROM legacy_record_mappings lm LEFT JOIN sales_quick_sale_items t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='bar_sales' AND lm.target_table='sales_quick_sale_items' AND t.id IS NULL`,
      );
      await exec(
        tx,
        `DELETE lm FROM legacy_record_mappings lm LEFT JOIN sales_pos_payments t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='bar_sales_fatora' AND lm.target_table='sales_pos_payments' AND t.id IS NULL`,
      );
      await exec(tx, "DROP TEMPORARY TABLE IF EXISTS tmp_legacy_bar_invoices");
      await exec(
        tx,
        "SET @legacy_sale_base=(SELECT COALESCE(MAX(id),0)+1000 FROM sales_quick_sales)",
      );
      await exec(
        tx,
        `CREATE TEMPORARY TABLE tmp_legacy_bar_invoices AS
      SELECT f.id source_id,@legacy_sale_base+f.id target_id,
        COALESCE(bm.new_branch_id,(SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key=${key})) branch_id,
        COALESCE(wm.target_id,(SELECT MIN(target_id) FROM legacy_record_mappings WHERE source_key=${key} AND legacy_table='store_branch_settings' AND target_table='inv_warehouses')) warehouse_id,
        DATE_FORMAT(FROM_UNIXTIME(f.date),'%Y-%m-%d') sale_date,
        ROW_NUMBER() OVER(PARTITION BY COALESCE(bm.new_branch_id,(SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key=${key})),DATE_FORMAT(FROM_UNIXTIME(f.date),'%Y-%m-%d') ORDER BY f.id)
        +COALESCE((SELECT MAX(q.daily_number) FROM sales_quick_sales q WHERE q.branch_id=COALESCE(bm.new_branch_id,(SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key=${key})) AND q.sale_date=DATE_FORMAT(FROM_UNIXTIME(f.date),'%Y-%m-%d')),0) daily_number
      FROM ${src}.bar_sales_fatora f LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=f.sub_branch_id_fk
      LEFT JOIN legacy_record_mappings wm ON wm.source_key=${key} AND wm.legacy_table='store_branch_settings' AND wm.legacy_id=CAST(f.sub_branch_id_fk AS CHAR) AND wm.target_table='inv_warehouses'
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='bar_sales_fatora'
       AND lm.legacy_id=CAST(f.id AS CHAR) AND lm.target_table='sales_quick_sales' WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        "ALTER TABLE tmp_legacy_bar_invoices ADD PRIMARY KEY (source_id), ADD UNIQUE KEY (target_id)",
      );
      await exec(tx, "DROP TEMPORARY TABLE IF EXISTS tmp_legacy_bar_costs");
      await exec(
        tx,
        `CREATE TEMPORARY TABLE tmp_legacy_bar_costs AS
      SELECT fatora_num,main_branch_id_fk,sub_branch_id_fk,date,
        SUM(COALESCE(CAST(NULLIF(pur_item_price,'') AS DECIMAL(12,2)),0)*item_amount) cost_total
      FROM ${src}.bar_sales GROUP BY fatora_num,main_branch_id_fk,sub_branch_id_fk,date`,
      );
      await exec(
        tx,
        "ALTER TABLE tmp_legacy_bar_costs ADD PRIMARY KEY (fatora_num,main_branch_id_fk,sub_branch_id_fk,date)",
      );
      await exec(
        tx,
        `INSERT INTO sales_quick_sales
      (id,sale_number,daily_number,customer_name,customer_phone,sale_type,branch_id,cashier_id,
       sale_date,sale_time,subtotal,discount_amount,discount_percentage,tax_amount,tax_percentage,
       total_amount,collected_amount,cost_total,payment_method,status,notes,warehouse_id,created_by,created_at,updated_at)
      SELECT x.target_id,CONCAT('LEGACY-BAR-',f.id),x.daily_number,LEFT(COALESCE(m.name,'عميل نقدي'),100),LEFT(m.phone,20),'customer',
        x.branch_id,um.new_user_id,x.sale_date,COALESCE(DATE_FORMAT(STR_TO_DATE(f.date_s,'%h:%i %p'),'%H:%i:%s'),'00:00:00'),
        COALESCE(NULLIF(f.fatora_before_discount,0),CAST(NULLIF(f.total,'') AS DECIMAL(10,2)),0),
        COALESCE(f.discount_value,0),0,0,0,COALESCE(NULLIF(f.fatora_after_discount,0),CAST(NULLIF(f.total,'') AS DECIMAL(10,2)),0),
        COALESCE(CAST(NULLIF(f.paid,'') AS DECIMAL(10,2)),0),
        COALESCE(c.cost_total,0),
        IF(f.pay_method=2,'card','cash'),'completed',CONCAT('Legacy Cafe invoice ',f.fatora_num,IF(NULLIF(f.notes,'') IS NULL,'',CONCAT(' | ',f.notes))),
        x.warehouse_id,um.new_user_id,TIMESTAMP(x.sale_date,COALESCE(STR_TO_DATE(f.date_s,'%h:%i %p'),'00:00:00')),
        TIMESTAMP(x.sale_date,COALESCE(STR_TO_DATE(f.date_s,'%h:%i %p'),'00:00:00'))
      FROM tmp_legacy_bar_invoices x JOIN ${src}.bar_sales_fatora f ON f.id=x.source_id
      LEFT JOIN tmp_legacy_bar_costs c ON c.fatora_num=f.fatora_num AND c.main_branch_id_fk=f.main_branch_id_fk
       AND c.sub_branch_id_fk=f.sub_branch_id_fk AND c.date=f.date
      LEFT JOIN ${src}.tbl_members m ON m.mem_id=f.client_id
      LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=f.publisher`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'bar_sales_fatora',CAST(source_id AS CHAR),'sales_quick_sales',target_id FROM tmp_legacy_bar_invoices`,
      );

      await exec(
        tx,
        "SET @legacy_sale_item_base=(SELECT COALESCE(MAX(id),0)+1000 FROM sales_quick_sale_items)",
      );
      await exec(
        tx,
        `INSERT INTO sales_quick_sale_items
      (id,quick_sale_id,item_type,product_id,cafe_product_id,inventory_product_id,ref_id,name,product_code,unit_price,quantity,line_total,unit_cost,line_cost)
      SELECT @legacy_sale_item_base+s.id,sm.target_id,'inventory',COALESCE(pm.target_id,op.target_id),
        COALESCE(cm.target_id,oc.target_id),COALESCE(pm.target_id,op.target_id),s.item_id,
        LEFT(COALESCE(i.name,CONCAT('Legacy item ',s.item_id)),150),LEFT(COALESCE(i.sanf_code,CONCAT('missing-',s.item_id)),50),
        COALESCE(CAST(NULLIF(s.item_price,'') AS DECIMAL(10,2)),0),s.item_amount,
        COALESCE(CAST(NULLIF(s.item_price,'') AS DECIMAL(10,2)),0)*s.item_amount,
        COALESCE(CAST(NULLIF(s.pur_item_price,'') AS DECIMAL(12,4)),0),COALESCE(CAST(NULLIF(s.pur_item_price,'') AS DECIMAL(12,2)),0)*s.item_amount
      FROM ${src}.bar_sales s JOIN ${src}.bar_sales_fatora f ON f.fatora_num=s.fatora_num AND f.main_branch_id_fk=s.main_branch_id_fk AND f.sub_branch_id_fk=s.sub_branch_id_fk AND f.date=s.date
      JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='bar_sales_fatora' AND sm.legacy_id=CAST(f.id AS CHAR) AND sm.target_table='sales_quick_sales'
      LEFT JOIN ${src}.store_item i ON i.id=s.item_id
      LEFT JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item' AND pm.legacy_id=CAST(i.id AS CHAR) AND pm.target_table='inv_products'
      LEFT JOIN legacy_record_mappings op ON op.source_key=${key} AND op.legacy_table='legacy_orphan_products' AND op.legacy_id=CONCAT('id:',s.item_id) AND op.target_table='inv_products'
      LEFT JOIN legacy_record_mappings cm ON cm.source_key=${key} AND cm.legacy_table='store_item' AND cm.legacy_id=CAST(i.id AS CHAR) AND cm.target_table='cafe_products'
      LEFT JOIN legacy_record_mappings oc ON oc.source_key=${key} AND oc.legacy_table='legacy_orphan_products' AND oc.legacy_id=CONCAT('id:',s.item_id) AND oc.target_table='cafe_products'
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='bar_sales' AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='sales_quick_sale_items'
      WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'bar_sales',CAST(s.id AS CHAR),'sales_quick_sale_items',@legacy_sale_item_base+s.id
      FROM ${src}.bar_sales s JOIN sales_quick_sale_items t ON t.id=@legacy_sale_item_base+s.id
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='bar_sales'
       AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='sales_quick_sale_items' WHERE lm.id IS NULL`,
      );

      await exec(
        tx,
        "SET @legacy_payment_base=(SELECT COALESCE(MAX(id),0)+1000 FROM sales_pos_payments)",
      );
      await exec(
        tx,
        `INSERT INTO sales_pos_payments (id,quick_sale_id,method,amount,reference,created_at)
      SELECT @legacy_payment_base+f.id,sm.target_id,IF(f.pay_method=2,'card','cash'),COALESCE(CAST(NULLIF(f.paid,'') AS DECIMAL(10,2)),0),
        CONCAT('legacy bar invoice ',f.id),q.created_at FROM ${src}.bar_sales_fatora f
      JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='bar_sales_fatora' AND sm.legacy_id=CAST(f.id AS CHAR) AND sm.target_table='sales_quick_sales'
      JOIN sales_quick_sales q ON q.id=sm.target_id LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='bar_sales_fatora' AND lm.legacy_id=CAST(f.id AS CHAR) AND lm.target_table='sales_pos_payments'
      WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'bar_sales_fatora',CAST(f.id AS CHAR),'sales_pos_payments',@legacy_payment_base+f.id
      FROM ${src}.bar_sales_fatora f JOIN sales_pos_payments p ON p.id=@legacy_payment_base+f.id
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='bar_sales_fatora' AND lm.legacy_id=CAST(f.id AS CHAR) AND lm.target_table='sales_pos_payments'
      WHERE lm.id IS NULL`,
      );
    },
  );

  await step(
    "1,588 stock-count sessions and 95,334 counted items",
    async (tx) => {
      await exec(
        tx,
        "DROP TEMPORARY TABLE IF EXISTS tmp_legacy_count_sessions",
      );
      await exec(
        tx,
        "SET @legacy_count_session_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_count_sessions)",
      );
      await exec(
        tx,
        `CREATE TEMPORARY TABLE tmp_legacy_count_sessions AS
      SELECT x.legacy_key,@legacy_count_session_base+ROW_NUMBER() OVER(ORDER BY x.epoch_date,x.legacy_key) target_id,
        x.branch_id,x.warehouse_id,x.epoch_date,x.legacy_user_id FROM (
        SELECT CONCAT(b.sub_branch_id_fk,'|',b.num_invent,'|',b.invent_date) legacy_key,
          bm.new_branch_id branch_id,wm.target_id warehouse_id,MIN(CAST(b.date AS SIGNED)) epoch_date,MIN(b.user_id) legacy_user_id
        FROM ${src}.bar_inventory_table b JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=CAST(b.sub_branch_id_fk AS UNSIGNED)
        JOIN legacy_record_mappings wm ON wm.source_key=${key} AND wm.legacy_table='store_branch_settings' AND wm.legacy_id=b.sub_branch_id_fk AND wm.target_table='inv_warehouses'
        LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='bar_inventory_sessions'
         AND lm.legacy_id=CONCAT(b.sub_branch_id_fk,'|',b.num_invent,'|',b.invent_date) AND lm.target_table='inv_count_sessions'
        WHERE lm.id IS NULL GROUP BY b.sub_branch_id_fk,b.num_invent,b.invent_date,bm.new_branch_id,wm.target_id
      ) x`,
      );
      await exec(
        tx,
        "ALTER TABLE tmp_legacy_count_sessions ADD PRIMARY KEY (legacy_key), ADD UNIQUE KEY (target_id)",
      );
      await exec(
        tx,
        `INSERT INTO inv_count_sessions (id,session_number,warehouse_id,branch_id,status,notes,created_by,created_at,updated_at)
      SELECT x.target_id,CONCAT('LEG-COUNT-',LEFT(REPLACE(x.legacy_key,'|','-'),40)),x.warehouse_id,x.branch_id,'approved',
        CONCAT('Legacy Cafe inventory session ',x.legacy_key),um.new_user_id,FROM_UNIXTIME(x.epoch_date),FROM_UNIXTIME(x.epoch_date)
      FROM tmp_legacy_count_sessions x LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=x.legacy_user_id`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'bar_inventory_sessions',legacy_key,'inv_count_sessions',target_id FROM tmp_legacy_count_sessions`,
      );

      await exec(
        tx,
        `DELETE lm FROM legacy_record_mappings lm LEFT JOIN inv_count_items t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='bar_inventory_table' AND lm.target_table='inv_count_items' AND t.id IS NULL`,
      );
      await exec(
        tx,
        "SET @legacy_count_item_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_count_items)",
      );
      await exec(
        tx,
        `INSERT INTO inv_count_items
      (id,session_id,product_id,item_code,item_name,category,system_quantity,counted_quantity,variance,status,variance_reason,created_at)
      SELECT @legacy_count_item_base+b.id,sm.target_id,COALESCE(pm.target_id,op.target_id),LEFT(COALESCE(i.sanf_code,CONCAT('missing-',b.item_id_fk)),50),
        LEFT(COALESCE(i.name,CONCAT('Legacy item ',b.item_id_fk)),255),'Cafe',CAST(b.available_amount AS DECIMAL(14,3)),b.amount,
        COALESCE(b.increase_amount,0)-COALESCE(b.deficit_amount,0),IF(COALESCE(b.increase_amount,0)=0 AND COALESCE(b.deficit_amount,0)=0,'matched','variance'),
        LEFT(b.notes,255),FROM_UNIXTIME(CAST(b.date AS SIGNED))
      FROM ${src}.bar_inventory_table b JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='bar_inventory_sessions'
       AND sm.legacy_id=CONCAT(b.sub_branch_id_fk,'|',b.num_invent,'|',b.invent_date) AND sm.target_table='inv_count_sessions'
      LEFT JOIN ${src}.store_item i ON i.id=b.item_id_fk
      LEFT JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item' AND pm.legacy_id=CAST(i.id AS CHAR) AND pm.target_table='inv_products'
      LEFT JOIN legacy_record_mappings op ON op.source_key=${key} AND op.legacy_table='legacy_orphan_products' AND op.legacy_id=CONCAT('id:',b.item_id_fk) AND op.target_table='inv_products'
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='bar_inventory_table' AND lm.legacy_id=CAST(b.id AS CHAR) AND lm.target_table='inv_count_items'
      WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'bar_inventory_table',CAST(b.id AS CHAR),'inv_count_items',@legacy_count_item_base+b.id
      FROM ${src}.bar_inventory_table b LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='bar_inventory_table' AND lm.legacy_id=CAST(b.id AS CHAR) AND lm.target_table='inv_count_items' WHERE lm.id IS NULL`,
      );

      await exec(
        tx,
        `INSERT IGNORE INTO inv_stock_balances
      (product_id,warehouse_id,current_stock,min_stock,max_stock,reorder_point,last_updated,created_at)
      SELECT product_id,warehouse_id,counted_quantity,0,1000000,0,created_at,created_at FROM (
        SELECT COALESCE(pm.target_id,op.target_id) product_id,wm.target_id warehouse_id,b.amount counted_quantity,FROM_UNIXTIME(CAST(b.date AS SIGNED)) created_at,
          ROW_NUMBER() OVER(PARTITION BY b.item_id_fk,b.sub_branch_id_fk ORDER BY CAST(b.date AS SIGNED) DESC,b.id DESC) rn
        FROM ${src}.bar_inventory_table b
        LEFT JOIN ${src}.store_item i ON i.id=b.item_id_fk
        LEFT JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item' AND pm.legacy_id=CAST(i.id AS CHAR) AND pm.target_table='inv_products'
        LEFT JOIN legacy_record_mappings op ON op.source_key=${key} AND op.legacy_table='legacy_orphan_products' AND op.legacy_id=CONCAT('id:',b.item_id_fk) AND op.target_table='inv_products'
        JOIN legacy_record_mappings wm ON wm.source_key=${key} AND wm.legacy_table='store_branch_settings' AND wm.legacy_id=b.sub_branch_id_fk AND wm.target_table='inv_warehouses'
      ) z WHERE rn=1`,
      );
    },
  );

  await step(
    "supplier catalog and 7,071 purchase invoices with 16,907 lines",
    async (tx) => {
      await exec(
        tx,
        "SET @legacy_supplier_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_suppliers)",
      );
      await exec(
        tx,
        `INSERT INTO inv_suppliers (id,name_ar,name_en,address,contact_person,notes,is_active,is_deleted,created_at,updated_at)
      SELECT @legacy_supplier_base+s.id,LEFT(s.name,150),LEFT(s.name,150),s.supplier_address,LEFT(s.accountant_name,150),
        CONCAT('Legacy supplier code ',s.code,'; phone ',s.supplier_phone,'; accountant phone ',s.accountant_telephone),1,0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM ${src}.store_other_suppliers s LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_other_suppliers' AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='inv_suppliers' WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'store_other_suppliers',CAST(s.id AS CHAR),'inv_suppliers',@legacy_supplier_base+s.id
      FROM ${src}.store_other_suppliers s LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_other_suppliers' AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='inv_suppliers' WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        "SET @legacy_fallback_supplier=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_suppliers)",
      );
      await exec(
        tx,
        `INSERT INTO inv_suppliers (id,name_ar,name_en,notes,is_active,is_deleted,created_at,updated_at)
      SELECT @legacy_fallback_supplier,'مورد قديم غير محدد','Unspecified legacy supplier','Used only where the legacy invoice did not store a supplier code',0,0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      WHERE NOT EXISTS(SELECT 1 FROM legacy_record_mappings WHERE source_key=${key} AND legacy_table='legacy_suppliers' AND legacy_id='unspecified' AND target_table='inv_suppliers')`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
      SELECT ${runId},${key},'legacy_suppliers','unspecified','inv_suppliers',@legacy_fallback_supplier,'placeholder'
      WHERE NOT EXISTS(SELECT 1 FROM legacy_record_mappings WHERE source_key=${key} AND legacy_table='legacy_suppliers' AND legacy_id='unspecified' AND target_table='inv_suppliers')`,
      );

      await exec(
        tx,
        "SET @legacy_purchase_base=(SELECT COALESCE(MAX(id),0)+1000 FROM prc_purchase_invoices)",
      );
      await exec(
        tx,
        `INSERT INTO prc_purchase_invoices
      (id,invoice_number,invoice_date,supplier_id,status,matching_status,notes,invoice_amount,branch_id,is_deleted,created_at,updated_at)
      SELECT @legacy_purchase_base+f.id,CONCAT('LEG-P-',f.id),LEFT(f.fatora_date,10),fs.target_id,'مكتملة','مستوردة',
        CONCAT('Legacy store purchase ',f.id,IF(NULLIF(f.byan,'') IS NULL,'',CONCAT(' | ',f.byan))),
        CASE WHEN f.fatora_cost_after_discount REGEXP '^-?[0-9]+([.][0-9]+)?$'
             THEN CAST(f.fatora_cost_after_discount AS DECIMAL(14,2)) ELSE 0 END,
        COALESCE(bm.new_branch_id,(SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key=${key})),0,
        CONCAT(LEFT(f.fatora_date,10),' 00:00:00'),CONCAT(LEFT(f.fatora_date,10),' 00:00:00')
      FROM ${src}.store_purchases_fatora f JOIN legacy_record_mappings fs ON fs.source_key=${key} AND fs.legacy_table='legacy_suppliers' AND fs.legacy_id='unspecified' AND fs.target_table='inv_suppliers'
      LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=f.sub_branch_id_fk
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_purchases_fatora' AND lm.legacy_id=CAST(f.id AS CHAR) AND lm.target_table='prc_purchase_invoices'
      WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'store_purchases_fatora',CAST(f.id AS CHAR),'prc_purchase_invoices',@legacy_purchase_base+f.id
      FROM ${src}.store_purchases_fatora f LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_purchases_fatora' AND lm.legacy_id=CAST(f.id AS CHAR) AND lm.target_table='prc_purchase_invoices' WHERE lm.id IS NULL`,
      );

      await exec(
        tx,
        "SET @legacy_other_purchase_base=(SELECT COALESCE(MAX(id),0)+1000 FROM prc_purchase_invoices)",
      );
      await exec(
        tx,
        `INSERT INTO prc_purchase_invoices
      (id,invoice_number,invoice_date,supplier_id,status,matching_status,notes,invoice_amount,branch_id,is_deleted,created_at,updated_at)
      SELECT @legacy_other_purchase_base+f.id,CONCAT('LEG-OP-',f.id),LEFT(f.fatora_date,10),sm.target_id,'مكتملة','مستوردة',
        CONCAT('Legacy other-store purchase ',f.id),
        CASE WHEN f.fatora_cost_after_discount REGEXP '^-?[0-9]+([.][0-9]+)?$'
             THEN CAST(f.fatora_cost_after_discount AS DECIMAL(14,2)) ELSE 0 END,
        COALESCE(bm.new_branch_id,(SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key=${key})),0,
        CONCAT(LEFT(f.fatora_date,10),' 00:00:00'),CONCAT(LEFT(f.fatora_date,10),' 00:00:00')
      FROM ${src}.store_purchases_other_fatora f JOIN ${src}.store_other_suppliers s ON s.code=CAST(f.supplier_code AS SIGNED)
      JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='store_other_suppliers' AND sm.legacy_id=CAST(s.id AS CHAR) AND sm.target_table='inv_suppliers'
      LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=f.sub_branch_id_fk
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_purchases_other_fatora' AND lm.legacy_id=CAST(f.id AS CHAR) AND lm.target_table='prc_purchase_invoices'
      WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'store_purchases_other_fatora',CAST(f.id AS CHAR),'prc_purchase_invoices',@legacy_other_purchase_base+f.id
      FROM ${src}.store_purchases_other_fatora f LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_purchases_other_fatora' AND lm.legacy_id=CAST(f.id AS CHAR) AND lm.target_table='prc_purchase_invoices' WHERE lm.id IS NULL`,
      );

      await exec(
        tx,
        "SET @legacy_purchase_item_base=(SELECT COALESCE(MAX(id),0)+1000 FROM prc_purchase_invoice_items)",
      );
      await exec(
        tx,
        `INSERT INTO prc_purchase_invoice_items (id,purchase_invoice_id,name,quantity,price,total)
      SELECT @legacy_purchase_item_base+p.id,im.target_id,LEFT(COALESCE(i.name,CONCAT('Legacy product ',p.product_code)),255),p.amount_buy,
        CASE WHEN p.amount_buy=0 THEN 0 ELSE p.all_cost_buy/p.amount_buy END,p.all_cost_buy
      FROM ${src}.store_purchases p JOIN legacy_record_mappings im ON im.source_key=${key} AND im.legacy_table='store_purchases_fatora'
       AND im.legacy_id=CAST(CAST(p.fatora_code AS UNSIGNED) AS CHAR) AND im.target_table='prc_purchase_invoices'
      LEFT JOIN ${src}.store_item i ON i.sanf_code=p.product_code LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_purchases' AND lm.legacy_id=CAST(p.id AS CHAR) AND lm.target_table='prc_purchase_invoice_items' WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'store_purchases',CAST(p.id AS CHAR),'prc_purchase_invoice_items',@legacy_purchase_item_base+p.id
      FROM ${src}.store_purchases p LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='store_purchases' AND lm.legacy_id=CAST(p.id AS CHAR) AND lm.target_table='prc_purchase_invoice_items' WHERE lm.id IS NULL`,
      );

      await exec(
        tx,
        "SET @legacy_other_purchase_item_base=(SELECT COALESCE(MAX(id),0)+1000 FROM prc_purchase_invoice_items)",
      );
      await exec(
        tx,
        `INSERT INTO prc_purchase_invoice_items (id,purchase_invoice_id,name,quantity,price,total)
      SELECT @legacy_other_purchase_item_base+p.id,im.target_id,LEFT(COALESCE(NULLIF(p.product_name,''),CONCAT('Legacy product ',p.product_code)),255),
        CAST(p.amount_buy AS DECIMAL(14,3)),COALESCE(p.one_price_buy,CASE WHEN CAST(p.amount_buy AS DECIMAL(14,3))=0 THEN 0 ELSE CAST(p.all_cost_buy AS DECIMAL(14,2))/CAST(p.amount_buy AS DECIMAL(14,3)) END),CAST(p.all_cost_buy AS DECIMAL(14,2))
      FROM ${src}.store_purchases_others p JOIN legacy_record_mappings im ON im.source_key=${key} AND im.legacy_table='store_purchases_other_fatora'
       AND im.legacy_id=CAST(CAST(p.fatora_code AS UNSIGNED) AS CHAR) AND im.target_table='prc_purchase_invoices'
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_purchases_others'
       AND lm.legacy_id=CAST(p.id AS CHAR) AND lm.target_table='prc_purchase_invoice_items' WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'store_purchases_others',CAST(p.id AS CHAR),'prc_purchase_invoice_items',@legacy_other_purchase_item_base+p.id
      FROM ${src}.store_purchases_others p JOIN legacy_record_mappings im ON im.source_key=${key} AND im.legacy_table='store_purchases_other_fatora'
       AND im.legacy_id=CAST(CAST(p.fatora_code AS UNSIGNED) AS CHAR) AND im.target_table='prc_purchase_invoices'
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_purchases_others'
       AND lm.legacy_id=CAST(p.id AS CHAR) AND lm.target_table='prc_purchase_invoice_items' WHERE lm.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'store_purchases_others',CAST(p.id AS CHAR),'legacy_archive',NULL,'archived_only',JSON_OBJECT('reason','source invoice header is missing')
      FROM ${src}.store_purchases_others p LEFT JOIN ${src}.store_purchases_other_fatora f ON f.id=CAST(p.fatora_code AS UNSIGNED)
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_purchases_others'
       AND lm.legacy_id=CAST(p.id AS CHAR) AND lm.target_table='legacy_archive' WHERE f.id IS NULL AND lm.id IS NULL`,
      );
    },
  );

  console.log("Legacy commerce import finished.");
}

main()
  .catch((error) => {
    console.error(
      "Legacy commerce import failed; the active step was rolled back.",
    );
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => target.$disconnect());
