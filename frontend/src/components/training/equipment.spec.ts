import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipmentForBranch, groupEquipment, uniqueEquipment } from './equipment-model';

const bike10 = { id: 1, name: 'دراجة ثابتة', imageUrl: null, branchId: 10, category: 'cardio' };
const bike20 = { id: 2, name: 'دراجة ثابتة ', imageUrl: null, branchId: 20, category: 'cardio' };
const bench20 = { id: 3, name: 'Bench', imageUrl: null, branchId: 20, category: null };

test('program entries take the same machine in the program branch, by name', () => {
  assert.deepEqual(equipmentForBranch([bike10, { ...bench20, id: 99, branchId: 10 }], [bike10, bike20, bench20], 20).map(x => x.id), [2, 3]);
  assert.deepEqual(equipmentForBranch([bike10], [bike10, bench20], 20), []);
  assert.deepEqual(equipmentForBranch([bike10], [], undefined), [bike10]);
});

test('club-wide pickers list each machine once and prefer the coach branch', () => {
  assert.deepEqual(uniqueEquipment([bike10, bike20, bench20], 20).map(x => x.id), [2, 3]);
  assert.deepEqual(uniqueEquipment([bike10, bike20]).map(x => x.id), [1]);
});

test('uncategorised equipment is grouped under other, after the known groups', () => {
  assert.deepEqual(groupEquipment([bench20, bike10]).map(g => g.group.id), ['cardio', 'other']);
});
