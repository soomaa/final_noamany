import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const membersPage = new URL('../src/pages/club/members.tsx', import.meta.url);

test('members list shows each member branch instead of their last gym check-in', async () => {
  const source = await readFile(membersPage, 'utf8');

  assert.match(
    source,
    /id: 'branch',\s*header: ct\('common\.branch'\),\s*cell: \(\{ row \}\) =>\s*resolveBranchName\(branches, row\.original\.branchId, user\?\.branch, user\?\.branch_name\)/s,
  );
  assert.doesNotMatch(source, /accessorKey: 'lastCheckIn'/);
});

test('members list does not embed a barcode check-in panel', async () => {
  const source = await readFile(membersPage, 'utf8');

  assert.doesNotMatch(source, /const handleCheckIn = async/);
  assert.doesNotMatch(source, /members\.barcodeTitle/);
});

test('members list column memo recomputes when localized registration-date text changes', async () => {
  const source = await readFile(membersPage, 'utf8');

  assert.match(
    source,
    /header: ui\('تاريخ تسجيل العضو'\)[\s\S]*?\[branches, ct, ui, canUpdateMembers, canDeleteMembers, user\?\.branch, user\?\.branch_name\]/,
  );
});
