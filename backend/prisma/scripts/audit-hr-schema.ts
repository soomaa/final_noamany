import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ColumnRow = {
  table_name: string;
  column_name: string;
  column_type: string;
  is_nullable: 'YES' | 'NO';
};

function assertIdentifier(value: string) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`Unsafe schema identifier: ${value}`);
  return value;
}

async function main() {
  const sourceSchema = assertIdentifier(process.env.LEGACY_HR_SCHEMA ?? 'noamanycenter_hr');
  const targetRows = await prisma.$queryRaw<Array<{ schema_name: string }>>`SELECT DATABASE() AS schema_name`;
  const targetSchema = assertIdentifier(targetRows[0]?.schema_name ?? '');

  const load = (schema: string) =>
    prisma.$queryRawUnsafe<ColumnRow[]>(`
      SELECT table_name, column_name, column_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = '${schema}'
        AND (
          table_name LIKE 'hr\\_%' ESCAPE '\\\\'
          OR table_name IN ('employees', 'users', 'tbl_hdoor_emps', 'tbl_hdodr_setting',
                            'tbl_hdoor_history', 'tbl_sites', 'holiday_setting', 'contract_employe',
                            'tbl_notifications', 'tbl_sys_notifications_settings')
        )
      ORDER BY table_name, ordinal_position
    `);

  const [source, target] = await Promise.all([load(sourceSchema), load(targetSchema)]);
  const targetColumns = new Map(target.map((row) => [`${row.table_name}.${row.column_name}`, row]));
  const targetTables = new Set(target.map((row) => row.table_name));
  const sourceTables = [...new Set(source.map((row) => row.table_name))];

  const missingTables = sourceTables.filter((table) => !targetTables.has(table));
  const missingColumns: Record<string, string[]> = {};
  const incompatibleTypes: Array<{ column: string; source: string; target: string }> = [];
  for (const column of source) {
    if (!targetTables.has(column.table_name)) continue;
    const key = `${column.table_name}.${column.column_name}`;
    const targetColumn = targetColumns.get(key);
    if (!targetColumn) {
      (missingColumns[column.table_name] ??= []).push(column.column_name);
    } else if (targetColumn.column_type.toLowerCase() !== column.column_type.toLowerCase()) {
      incompatibleTypes.push({ column: key, source: column.column_type, target: targetColumn.column_type });
    }
  }

  console.log(
    JSON.stringify(
      {
        sourceSchema,
        targetSchema,
        sourceTables: sourceTables.length,
        targetTables: targetTables.size,
        missingTables,
        missingColumns,
        incompatibleTypes,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
