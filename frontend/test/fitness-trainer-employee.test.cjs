const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('trainer employee selector displays the employee directory name', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/club/fitness/trainers/index.tsx'),
    'utf8',
  );

  assert.match(source, /useArrayResource<\{ id: number; employee: string \}>\('employees\/pos-options'\)/);
  assert.match(source, /<Combobox[\s\S]*?value=\{form\.employeeId\}/);
  assert.match(source, /map\(\(e\) => \(\{ value: String\(e\.id\), label: e\.employee \}\)\)/);
  assert.match(source, /searchPlaceholder="بحث عن موظف…"/);
});
