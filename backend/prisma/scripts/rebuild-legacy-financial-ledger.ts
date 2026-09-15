/* eslint-disable no-console */
/**
 * Replace pre-import demo accounting activity with a real, balanced ledger
 * generated from the canonical legacy receipts, Cafe sales and expenses.
 *
 * The script is transactional and idempotent. It only removes two proven
 * local-demo fingerprints; imported and subsequently-created live documents
 * are never selected by those cleanup predicates.
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

type IdRow = { id: number };
type CountRow = { n: bigint | number };

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function databaseName(url: string): string {
  const value = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  if (!value) throw new Error("DATABASE_URL has no database name");
  return value;
}

function safeIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
  return `\`${value}\``;
}

function literal(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

async function exec(
  tx: Prisma.TransactionClient,
  sql: string,
): Promise<number> {
  return tx.$executeRawUnsafe(sql);
}

async function count(
  tx: Prisma.TransactionClient,
  sql: string,
): Promise<number> {
  const rows = await tx.$queryRawUnsafe<CountRow[]>(sql);
  return Number(rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const sourceDatabase = required("LEGACY_DATABASE");
  const targetDatabase = databaseName(required("DATABASE_URL"));
  const sourceKey = required("LEGACY_SOURCE_KEY");
  const dumpSha = required("LEGACY_DUMP_SHA256").toLowerCase();
  if (sourceDatabase === targetDatabase) {
    throw new Error("Legacy and target databases must differ");
  }

  const source = safeIdentifier(sourceDatabase);
  const key = literal(sourceKey);
  const runs = await prisma.$queryRawUnsafe<IdRow[]>(
    `SELECT id FROM legacy_import_runs WHERE source_key=${key} AND dump_sha256=${literal(dumpSha)}`,
  );
  if (runs.length !== 1) throw new Error("Legacy import run is missing");
  const runId = runs[0].id;

  console.log(`=== Rebuild real legacy financial ledger: run ${runId} ===`);
  await prisma.$transaction(
    async (tx) => {
      await exec(tx, "SET time_zone='+00:00'");
      await exec(tx, "SET collation_connection='utf8mb4_unicode_ci'");

      // These rows were created by the July local UAT cluster and do not
      // resolve to any imported legacy document. The predicates deliberately
      // include their fixed dates/numbers so a later real app entry is safe.
      const removedDemoEntries = await exec(
        tx,
        `DELETE FROM acc_journal_entries
         WHERE (entry_no REGEXP '^JE-A-202607(11|18|21|22|23)-')
            OR (entry_no LIKE 'JE-2026-%' AND reference IN
              ('OPEN-2026','SUB-2026-03','POS-2026-04','PAY-2026-04','SUB-2026-05',
               'EXP-2026-05','PO-2026-06','SUB-2026-06','PAY-SUP-2026-06',
               'EXP-2026-06','DRAFT-2026-07'))`,
      );
      const removedDemoRevenues = await exec(
        tx,
        `DELETE FROM fin_revenues
         WHERE (customer_name='اختبار مالي محلي'
           AND source_ref IN ('BKP-2026-000001','BKR-2026-000001'))
            OR (revenue_number REGEXP '^REV-2026-[0-9]{4}$'
              AND source_ref REGEXP '^REF-[0-9]+$')`,
      );
      console.log(
        `    removed proven demo rows: ${removedDemoEntries} journals, ${removedDemoRevenues} revenues`,
      );

      // Real accounting configuration, derived from the years present in the
      // imported documents rather than from the old fixed demo date.
      await exec(
        tx,
        `INSERT INTO acc_settings
          (fiscal_year_start,base_currency,currency_symbol,require_approval,created_at,updated_at)
         SELECT '01-01','EGP','ج.م',0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
         WHERE NOT EXISTS(SELECT 1 FROM acc_settings)`,
      );
      await exec(tx, "DROP TEMPORARY TABLE IF EXISTS tmp_legacy_finance_years");
      await exec(
        tx,
        `CREATE TEMPORARY TABLE tmp_legacy_finance_years AS
         SELECT DISTINCT LEFT(document_date,4) year_value FROM (
           SELECT r.receipt_date document_date
           FROM legacy_record_mappings m JOIN club_receipts r ON r.id=m.target_id
           WHERE m.source_key=${key} AND m.legacy_table='tbl_subscription_members'
             AND m.target_table='club_receipts'
           UNION ALL
           SELECT s.sale_date
           FROM legacy_record_mappings m JOIN sales_quick_sales s ON s.id=m.target_id
           WHERE m.source_key=${key} AND m.legacy_table='bar_sales_fatora'
             AND m.target_table='sales_quick_sales'
           UNION ALL
           SELECT e.expense_date
           FROM legacy_record_mappings m JOIN fin_expenses e ON e.id=m.target_id
           WHERE m.source_key=${key} AND m.target_table='fin_expenses'
             AND m.legacy_table IN ('tbl_expense_bills','finance_sarf_order')
         ) dates WHERE document_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
      );
      await exec(
        tx,
        `INSERT INTO acc_accounting_periods
          (name,start_date,end_date,status,created_at,updated_at)
         SELECT CONCAT('السنة المالية ',year_value),CONCAT(year_value,'-01-01'),
          CONCAT(year_value,'-12-31'),IF(year_value=YEAR(CURDATE()),'open','closed'),
          CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
         FROM tmp_legacy_finance_years y
         WHERE NOT EXISTS(
           SELECT 1 FROM acc_accounting_periods p
           WHERE p.start_date=CONCAT(y.year_value,'-01-01')
             AND p.end_date=CONCAT(y.year_value,'-12-31')
         )`,
      );

      // Operational revenue documents used by the Finance lists.
      await exec(
        tx,
        `INSERT INTO fin_revenues
          (revenue_number,revenue_date,source,sub_source,amount,tax_amount,
           discount_amount,total_amount,net_amount,payment_method,payment_status,
           description,customer_name,receipt_number,source_module,source_ref,
           branch_id,notes,created_by,is_deleted,created_at,updated_at)
         SELECT CONCAT('LEG-REV-SUB-',m.legacy_id),r.receipt_date,'اشتراكات النادي',
          COALESCE(r.type,'إيصال اشتراك'),r.amount,0,0,r.amount,r.amount,
          CASE r.payment_method WHEN 'card' THEN 'بطاقة' WHEN 'bank' THEN 'تحويل بنكي' ELSE 'نقدي' END,
          'مدفوع',r.description,r.member_name,r.receipt_number,'legacy_subscription',m.legacy_id,
          r.branch_id,CONCAT('Imported from tbl_subscription_members legacy id=',m.legacy_id),
          r.created_by,0,r.created_at,r.updated_at
         FROM legacy_record_mappings m JOIN club_receipts r ON r.id=m.target_id
         WHERE m.source_key=${key} AND m.legacy_table='tbl_subscription_members'
           AND m.target_table='club_receipts' AND r.amount>0
         ON DUPLICATE KEY UPDATE revenue_date=VALUES(revenue_date),source=VALUES(source),
          sub_source=VALUES(sub_source),amount=VALUES(amount),total_amount=VALUES(total_amount),
          net_amount=VALUES(net_amount),payment_method=VALUES(payment_method),
          customer_name=VALUES(customer_name),receipt_number=VALUES(receipt_number),
          branch_id=VALUES(branch_id),notes=VALUES(notes),is_deleted=0,deleted_at=NULL,
          updated_at=VALUES(updated_at)`,
      );
      await exec(
        tx,
        `INSERT INTO fin_revenues
          (revenue_number,revenue_date,source,sub_source,amount,tax_amount,
           discount_amount,total_amount,net_amount,payment_method,payment_status,
           description,customer_name,invoice_number,source_module,source_ref,
           branch_id,notes,created_by,is_deleted,created_at,updated_at)
         SELECT CONCAT('LEG-REV-CAFE-',m.legacy_id),s.sale_date,'مبيعات الكافيه',
          'نقطة البيع',s.subtotal,s.tax_amount,s.discount_amount,s.total_amount,
          s.total_amount-s.tax_amount,CASE s.payment_method
            WHEN 'card' THEN 'بطاقة' WHEN 'bank' THEN 'تحويل بنكي' ELSE 'نقدي' END,
          'مدفوع',s.notes,s.customer_name,s.sale_number,'legacy_cafe_sale',m.legacy_id,
          s.branch_id,CONCAT('Imported from bar_sales_fatora legacy id=',m.legacy_id),
          s.created_by,0,s.created_at,s.updated_at
         FROM legacy_record_mappings m JOIN sales_quick_sales s ON s.id=m.target_id
         WHERE m.source_key=${key} AND m.legacy_table='bar_sales_fatora'
           AND m.target_table='sales_quick_sales' AND s.status='completed'
         ON DUPLICATE KEY UPDATE revenue_date=VALUES(revenue_date),source=VALUES(source),
          sub_source=VALUES(sub_source),amount=VALUES(amount),tax_amount=VALUES(tax_amount),
          discount_amount=VALUES(discount_amount),total_amount=VALUES(total_amount),
          net_amount=VALUES(net_amount),payment_method=VALUES(payment_method),
          customer_name=VALUES(customer_name),invoice_number=VALUES(invoice_number),
          branch_id=VALUES(branch_id),notes=VALUES(notes),is_deleted=0,deleted_at=NULL,
          updated_at=VALUES(updated_at)`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings
          (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
         SELECT ${runId},${key},'tbl_subscription_members',r.source_ref,'fin_revenues',r.id,'mapped'
         FROM fin_revenues r LEFT JOIN legacy_record_mappings m
          ON m.source_key=${key} AND m.legacy_table='tbl_subscription_members'
         AND m.legacy_id=r.source_ref AND m.target_table='fin_revenues'
         WHERE r.source_module='legacy_subscription' AND m.id IS NULL`,
      );
      await exec(
        tx,
        `INSERT INTO legacy_record_mappings
          (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
         SELECT ${runId},${key},'bar_sales_fatora',r.source_ref,'fin_revenues',r.id,'mapped'
         FROM fin_revenues r LEFT JOIN legacy_record_mappings m
          ON m.source_key=${key} AND m.legacy_table='bar_sales_fatora'
         AND m.legacy_id=r.source_ref AND m.target_table='fin_revenues'
         WHERE r.source_module='legacy_cafe_sale' AND m.id IS NULL`,
      );

      // Balanced GL headers. Every source document gets one deterministic
      // journal entry, so reruns update rather than duplicate.
      await exec(
        tx,
        `INSERT INTO acc_journal_entries
          (entry_no,date,period_id,branch_id,description,reference,status,
           source_module,source_doc_type,source_doc_id,source_version,total_debit,
           total_credit,created_by,posted_by,posted_at,created_at,updated_at)
         SELECT CONCAT('LEG-SUB-',m.legacy_id),r.receipt_date,p.id,r.branch_id,
          CONCAT('إيراد اشتراك حقيقي — ',r.receipt_number),r.receipt_number,'posted',
          'legacy_import','subscription_receipt',CONCAT('tbl_subscription_members:',m.legacy_id),1,
          r.amount,r.amount,r.created_by,r.created_by,r.created_at,r.created_at,r.updated_at
         FROM legacy_record_mappings m JOIN club_receipts r ON r.id=m.target_id
         LEFT JOIN acc_accounting_periods p ON r.receipt_date BETWEEN p.start_date AND p.end_date
         WHERE m.source_key=${key} AND m.legacy_table='tbl_subscription_members'
           AND m.target_table='club_receipts' AND r.amount>0
         ON DUPLICATE KEY UPDATE date=VALUES(date),period_id=VALUES(period_id),
          branch_id=VALUES(branch_id),description=VALUES(description),reference=VALUES(reference),
          status='posted',total_debit=VALUES(total_debit),total_credit=VALUES(total_credit),
          created_by=VALUES(created_by),posted_by=VALUES(posted_by),posted_at=VALUES(posted_at),
          updated_at=VALUES(updated_at)`,
      );
      await exec(
        tx,
        `INSERT INTO acc_journal_entries
          (entry_no,date,period_id,branch_id,description,reference,status,
           source_module,source_doc_type,source_doc_id,source_version,total_debit,
           total_credit,created_by,posted_by,posted_at,created_at,updated_at)
         SELECT CONCAT('LEG-CAFE-',m.legacy_id),s.sale_date,p.id,s.branch_id,
          CONCAT('مبيعات كافيه حقيقية — ',s.sale_number),s.sale_number,'posted',
          'legacy_import','cafe_sale',CONCAT('bar_sales_fatora:',m.legacy_id),1,
          s.total_amount+COALESCE(s.cost_total,0),s.total_amount+COALESCE(s.cost_total,0),
          s.created_by,s.created_by,s.created_at,s.created_at,s.updated_at
         FROM legacy_record_mappings m JOIN sales_quick_sales s ON s.id=m.target_id
         LEFT JOIN acc_accounting_periods p ON s.sale_date BETWEEN p.start_date AND p.end_date
         WHERE m.source_key=${key} AND m.legacy_table='bar_sales_fatora'
           AND m.target_table='sales_quick_sales' AND s.status='completed'
         ON DUPLICATE KEY UPDATE date=VALUES(date),period_id=VALUES(period_id),
          branch_id=VALUES(branch_id),description=VALUES(description),reference=VALUES(reference),
          status='posted',total_debit=VALUES(total_debit),total_credit=VALUES(total_credit),
          created_by=VALUES(created_by),posted_by=VALUES(posted_by),posted_at=VALUES(posted_at),
          updated_at=VALUES(updated_at)`,
      );
      for (const [legacyTable, docType, prefix] of [
        ["tbl_expense_bills", "expense_bill", "LEG-EXP-"],
        ["finance_sarf_order", "disbursement_order", "LEG-SARF-"],
      ]) {
        await exec(
          tx,
          `INSERT INTO acc_journal_entries
            (entry_no,date,period_id,branch_id,description,reference,status,
             source_module,source_doc_type,source_doc_id,source_version,total_debit,
             total_credit,created_by,posted_by,posted_at,created_at,updated_at)
           SELECT CONCAT(${literal(prefix)},m.legacy_id),e.expense_date,p.id,e.branch_id,
            CONCAT('مصروف حقيقي — ',e.expense_number,IF(e.description IS NULL,'',CONCAT(' — ',e.description))),
            e.expense_number,'posted','legacy_import',${literal(docType)},
            CONCAT(${literal(`${legacyTable}:`)},m.legacy_id),1,ABS(e.total_amount),ABS(e.total_amount),
            e.created_by,e.created_by,COALESCE(e.approved_at,e.created_at),e.created_at,e.updated_at
           FROM legacy_record_mappings m JOIN fin_expenses e ON e.id=m.target_id
           LEFT JOIN acc_accounting_periods p ON e.expense_date BETWEEN p.start_date AND p.end_date
           WHERE m.source_key=${key} AND m.legacy_table=${literal(legacyTable)}
             AND m.target_table='fin_expenses' AND e.is_deleted=0 AND e.total_amount<>0
           ON DUPLICATE KEY UPDATE date=VALUES(date),period_id=VALUES(period_id),
            branch_id=VALUES(branch_id),description=VALUES(description),reference=VALUES(reference),
            status='posted',total_debit=VALUES(total_debit),total_credit=VALUES(total_credit),
            created_by=VALUES(created_by),posted_by=VALUES(posted_by),posted_at=VALUES(posted_at),
            updated_at=VALUES(updated_at)`,
        );
      }

      // Rebuild only the imported lines. Header/line totals use actual document
      // amounts; imported accounts come from the real legacy chart (dalel).
      await exec(
        tx,
        `DELETE l FROM acc_journal_entry_lines l JOIN acc_journal_entries e ON e.id=l.entry_id
         WHERE e.source_module='legacy_import'`,
      );
      await exec(
        tx,
        `INSERT INTO acc_journal_entry_lines
          (entry_id,account_id,debit,credit,description,line_order,created_at)
         SELECT e.id,IF(r.payment_method='card',bank.target_id,cash.target_id),r.amount,0,
          CONCAT('تحصيل ',r.receipt_number),0,e.created_at
         FROM legacy_record_mappings m JOIN club_receipts r ON r.id=m.target_id
         JOIN acc_journal_entries e ON e.source_module='legacy_import'
          AND e.source_doc_type='subscription_receipt'
          AND e.source_doc_id=CONCAT('tbl_subscription_members:',m.legacy_id)
         JOIN legacy_record_mappings cash ON cash.source_key=${key} AND cash.legacy_table='dalel'
          AND cash.legacy_id='84' AND cash.target_table='acc_accounts'
         JOIN legacy_record_mappings bank ON bank.source_key=${key} AND bank.legacy_table='dalel'
          AND bank.legacy_id='837' AND bank.target_table='acc_accounts'
         WHERE m.source_key=${key} AND m.legacy_table='tbl_subscription_members'
          AND m.target_table='club_receipts' AND r.amount>0
         UNION ALL
         SELECT e.id,revenue.target_id,0,r.amount,CONCAT('إيراد ',r.receipt_number),1,e.created_at
         FROM legacy_record_mappings m JOIN club_receipts r ON r.id=m.target_id
         JOIN acc_journal_entries e ON e.source_module='legacy_import'
          AND e.source_doc_type='subscription_receipt'
          AND e.source_doc_id=CONCAT('tbl_subscription_members:',m.legacy_id)
         JOIN legacy_record_mappings revenue ON revenue.source_key=${key} AND revenue.legacy_table='dalel'
          AND revenue.legacy_id='1021' AND revenue.target_table='acc_accounts'
         WHERE m.source_key=${key} AND m.legacy_table='tbl_subscription_members'
          AND m.target_table='club_receipts' AND r.amount>0`,
      );
      await exec(
        tx,
        `INSERT INTO acc_journal_entry_lines
          (entry_id,account_id,debit,credit,description,line_order,created_at)
         SELECT e.id,IF(s.payment_method='card',bank.target_id,cash.target_id),s.total_amount,0,
          CONCAT('تحصيل ',s.sale_number),0,e.created_at
         FROM legacy_record_mappings m JOIN sales_quick_sales s ON s.id=m.target_id
         JOIN acc_journal_entries e ON e.source_module='legacy_import' AND e.source_doc_type='cafe_sale'
          AND e.source_doc_id=CONCAT('bar_sales_fatora:',m.legacy_id)
         JOIN legacy_record_mappings cash ON cash.source_key=${key} AND cash.legacy_table='dalel'
          AND cash.legacy_id='84' AND cash.target_table='acc_accounts'
         JOIN legacy_record_mappings bank ON bank.source_key=${key} AND bank.legacy_table='dalel'
          AND bank.legacy_id='837' AND bank.target_table='acc_accounts'
         WHERE m.source_key=${key} AND m.legacy_table='bar_sales_fatora'
          AND m.target_table='sales_quick_sales' AND s.status='completed'
         UNION ALL
         SELECT e.id,revenue.target_id,0,s.total_amount,CONCAT('إيراد ',s.sale_number),1,e.created_at
         FROM legacy_record_mappings m JOIN sales_quick_sales s ON s.id=m.target_id
         JOIN acc_journal_entries e ON e.source_module='legacy_import' AND e.source_doc_type='cafe_sale'
          AND e.source_doc_id=CONCAT('bar_sales_fatora:',m.legacy_id)
         JOIN legacy_record_mappings revenue ON revenue.source_key=${key} AND revenue.legacy_table='dalel'
          AND revenue.legacy_id='525' AND revenue.target_table='acc_accounts'
         WHERE m.source_key=${key} AND m.legacy_table='bar_sales_fatora'
          AND m.target_table='sales_quick_sales' AND s.status='completed'
         UNION ALL
         SELECT e.id,cogs.target_id,s.cost_total,0,CONCAT('تكلفة ',s.sale_number),2,e.created_at
         FROM legacy_record_mappings m JOIN sales_quick_sales s ON s.id=m.target_id
         JOIN acc_journal_entries e ON e.source_module='legacy_import' AND e.source_doc_type='cafe_sale'
          AND e.source_doc_id=CONCAT('bar_sales_fatora:',m.legacy_id)
         JOIN legacy_record_mappings cogs ON cogs.source_key=${key} AND cogs.legacy_table='dalel'
          AND cogs.legacy_id='787' AND cogs.target_table='acc_accounts'
         WHERE m.source_key=${key} AND m.legacy_table='bar_sales_fatora'
          AND m.target_table='sales_quick_sales' AND s.status='completed' AND s.cost_total>0
         UNION ALL
         SELECT e.id,inventory.target_id,0,s.cost_total,CONCAT('صرف مخزون ',s.sale_number),3,e.created_at
         FROM legacy_record_mappings m JOIN sales_quick_sales s ON s.id=m.target_id
         JOIN acc_journal_entries e ON e.source_module='legacy_import' AND e.source_doc_type='cafe_sale'
          AND e.source_doc_id=CONCAT('bar_sales_fatora:',m.legacy_id)
         JOIN legacy_record_mappings inventory ON inventory.source_key=${key} AND inventory.legacy_table='dalel'
          AND inventory.legacy_id='149' AND inventory.target_table='acc_accounts'
         WHERE m.source_key=${key} AND m.legacy_table='bar_sales_fatora'
          AND m.target_table='sales_quick_sales' AND s.status='completed' AND s.cost_total>0`,
      );
      await exec(
        tx,
        `INSERT INTO acc_journal_entry_lines
          (entry_id,account_id,debit,credit,description,line_order,created_at)
         SELECT e.id,
          CASE WHEN x.category LIKE '%كهرب%' THEN electricity.target_id
               WHEN COALESCE(x.description,'') LIKE '%رواتب%' THEN salary.target_id
               ELSE general_expense.target_id END,
          IF(x.total_amount>0,x.total_amount,0),IF(x.total_amount<0,ABS(x.total_amount),0),
          COALESCE(x.description,x.expense_number),0,e.created_at
         FROM legacy_record_mappings m JOIN fin_expenses x ON x.id=m.target_id
         JOIN acc_journal_entries e ON e.source_module='legacy_import'
          AND e.source_doc_type=CASE m.legacy_table WHEN 'tbl_expense_bills' THEN 'expense_bill' ELSE 'disbursement_order' END
          AND e.source_doc_id=CONCAT(m.legacy_table,':',m.legacy_id)
         JOIN legacy_record_mappings electricity ON electricity.source_key=${key}
          AND electricity.legacy_table='dalel' AND electricity.legacy_id='612'
          AND electricity.target_table='acc_accounts'
         JOIN legacy_record_mappings salary ON salary.source_key=${key}
          AND salary.legacy_table='dalel' AND salary.legacy_id='1033'
          AND salary.target_table='acc_accounts'
         JOIN legacy_record_mappings general_expense ON general_expense.source_key=${key}
          AND general_expense.legacy_table='dalel' AND general_expense.legacy_id='684'
          AND general_expense.target_table='acc_accounts'
         WHERE m.source_key=${key} AND m.target_table='fin_expenses'
          AND m.legacy_table IN ('tbl_expense_bills','finance_sarf_order')
          AND x.is_deleted=0 AND x.total_amount<>0
         UNION ALL
         SELECT e.id,CASE WHEN x.payment_method LIKE '%تحويل%' OR x.payment_method LIKE '%بنك%'
                           THEN bank.target_id ELSE cash.target_id END,
          IF(x.total_amount<0,ABS(x.total_amount),0),IF(x.total_amount>0,x.total_amount,0),
          CONCAT(IF(x.total_amount<0,'عكس ','سداد '),x.expense_number),1,e.created_at
         FROM legacy_record_mappings m JOIN fin_expenses x ON x.id=m.target_id
         JOIN acc_journal_entries e ON e.source_module='legacy_import'
          AND e.source_doc_type=CASE m.legacy_table WHEN 'tbl_expense_bills' THEN 'expense_bill' ELSE 'disbursement_order' END
          AND e.source_doc_id=CONCAT(m.legacy_table,':',m.legacy_id)
         JOIN legacy_record_mappings cash ON cash.source_key=${key} AND cash.legacy_table='dalel'
          AND cash.legacy_id='84' AND cash.target_table='acc_accounts'
         JOIN legacy_record_mappings bank ON bank.source_key=${key} AND bank.legacy_table='dalel'
          AND bank.legacy_id='837' AND bank.target_table='acc_accounts'
         WHERE m.source_key=${key} AND m.target_table='fin_expenses'
          AND m.legacy_table IN ('tbl_expense_bills','finance_sarf_order')
          AND x.is_deleted=0 AND x.total_amount<>0`,
      );

      for (const [legacyTable, docType] of [
        ["tbl_subscription_members", "subscription_receipt"],
        ["bar_sales_fatora", "cafe_sale"],
        ["tbl_expense_bills", "expense_bill"],
        ["finance_sarf_order", "disbursement_order"],
      ]) {
        await exec(
          tx,
          `INSERT INTO legacy_record_mappings
            (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
           SELECT ${runId},${key},${literal(legacyTable)},
            SUBSTRING_INDEX(e.source_doc_id,':',-1),'acc_journal_entries',e.id,'mapped'
           FROM acc_journal_entries e LEFT JOIN legacy_record_mappings m
            ON m.source_key=${key} AND m.legacy_table=${literal(legacyTable)}
           AND m.legacy_id=SUBSTRING_INDEX(e.source_doc_id,':',-1)
           AND m.target_table='acc_journal_entries'
           WHERE e.source_module='legacy_import' AND e.source_doc_type=${literal(docType)}
            AND m.id IS NULL`,
        );
      }

      const unbalanced = await count(
        tx,
        `SELECT COUNT(*) n FROM (
          SELECT e.id,e.total_debit,e.total_credit,
           COALESCE(SUM(l.debit),0) line_debit,COALESCE(SUM(l.credit),0) line_credit
          FROM acc_journal_entries e
          LEFT JOIN acc_journal_entry_lines l ON l.entry_id=e.id
          WHERE e.source_module='legacy_import'
          GROUP BY e.id,e.total_debit,e.total_credit
          HAVING total_debit<>total_credit OR line_debit<>line_credit
            OR total_debit<>line_debit OR total_credit<>line_credit
        ) bad`,
      );
      if (unbalanced !== 0) {
        throw new Error(
          `Legacy ledger contains ${unbalanced} unbalanced entries`,
        );
      }

      const documentCounts = await tx.$queryRawUnsafe<
        Array<{ source_doc_type: string; n: bigint | number }>
      >(`SELECT source_doc_type,COUNT(*) n FROM acc_journal_entries
         WHERE source_module='legacy_import' GROUP BY source_doc_type ORDER BY source_doc_type`);
      console.log(
        "    real journal entries:",
        documentCounts
          .map((row) => `${row.source_doc_type}=${Number(row.n)}`)
          .join(", "),
      );
    },
    { maxWait: 30_000, timeout: 1_800_000 },
  );

  console.log("Real legacy financial ledger rebuilt successfully.");
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
