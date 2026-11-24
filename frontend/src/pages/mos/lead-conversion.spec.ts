import assert from 'node:assert/strict';
import test from 'node:test';
import { canConvertLead, canEditLead, editableLeadStatuses } from './lead-conversion.ts';

test('allows conversion only for a lead with a phone that was not converted yet', () => {
  assert.equal(canConvertLead({ phone: '01012345678', status: 'new' }), true);
  assert.equal(canConvertLead({ phone: null, status: 'new' }), false);
  assert.equal(canConvertLead({ phone: '01012345678', status: 'converted' }), false);
});

test('does not allow editing a converted lead', () => {
  assert.equal(canEditLead({ status: 'new' }), true);
  assert.equal(canEditLead({ status: 'converted' }), false);
});

test('does not offer the converted status in the lead form', () => {
  const statuses = editableLeadStatuses([
    { key: 'new' },
    { key: 'contacted' },
    { key: 'converted' },
    { key: 'lost' },
  ]);

  assert.deepEqual(statuses.map((status) => status.key), ['new', 'contacted', 'lost']);
});
