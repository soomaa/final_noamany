import assert from 'node:assert/strict';
import test from 'node:test';
import { selectableCustomerSources } from './customer-sources.ts';

test('excludes inactive legacy sources from new member and potential-member choices', () => {
  assert.deepEqual(
    selectableCustomerSources([
      { id: 1, name: 'Facebook', isActive: true },
      { id: 2, name: 'Instagram', isActive: false },
      { id: 3, name: 'Hotline', isActive: true },
    ]),
    [
      { id: 1, name: 'Facebook', isActive: true },
      { id: 3, name: 'Hotline', isActive: true },
    ],
  );
});
