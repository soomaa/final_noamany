import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../prisma/migrations/20261015120000_restore_cafe_invoice_classification/migration.sql', import.meta.url), 'utf8');
const mysql = sql => execFileSync('mysql', ['--user=root', '--batch', '--skip-column-names', '-e', sql], { encoding: 'utf8' });

for (const existingColumns of [false, true]) {
  test(`migration preserves historical rows and can run twice (existing columns: ${existingColumns})`, () => {
    const database = `cafe_classification_test_${randomUUID().replaceAll('-', '')}`;
    try {
      mysql(`CREATE DATABASE \`${database}\`; USE \`${database}\`;
        CREATE TABLE inv_categories (id INT NOT NULL PRIMARY KEY);
        INSERT INTO inv_categories VALUES (7);
        CREATE TABLE sales_quick_sales (id INT NOT NULL PRIMARY KEY, customer_name VARCHAR(100) NOT NULL
          ${existingColumns ? ", gender ENUM('male','female') NULL, cafe_category_id INT NULL, INDEX existing_category_index(cafe_category_id), CONSTRAINT existing_category_fk FOREIGN KEY(cafe_category_id) REFERENCES inv_categories(id)" : ''});
        INSERT INTO sales_quick_sales (id,customer_name${existingColumns ? ',gender,cafe_category_id' : ''})
          VALUES (42,'historical'${existingColumns ? ",'female',7" : ''});
        ${migration}
        ${migration}`);
      const rows = mysql(`USE \`${database}\`; SELECT id,customer_name,gender,cafe_category_id FROM sales_quick_sales;`).trim();
      assert.equal(rows, `42\thistorical\t${existingColumns ? 'female\t7' : 'NULL\tNULL'}`);
      const keys = mysql(`SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA='${database}' AND TABLE_NAME='sales_quick_sales' AND REFERENCED_TABLE_NAME='inv_categories';`).trim();
      assert.equal(keys, '1');
      mysql(`USE \`${database}\`; INSERT INTO sales_quick_sales (id,customer_name,gender,cafe_category_id) VALUES (43,'new','male',7);`);
      assert.throws(() => mysql(`USE \`${database}\`; INSERT INTO sales_quick_sales (id,customer_name,gender,cafe_category_id) VALUES (44,'invalid','male',999);`));
    } finally {
      mysql(`DROP DATABASE IF EXISTS \`${database}\`;`);
    }
  });
}
