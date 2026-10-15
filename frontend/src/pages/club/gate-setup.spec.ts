import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGateSetup, validateGateForm } from './gate-setup';
const form = { name: 'Main', branchId: '4', model: 'INBIO160-PRO', staticIp: '192.168.1.202', port: '4370', entryDoorNo: '1', exitDoorNo: '0' };
test('validates IPv4, ports, and actual relay capacity', () => {
  assert.equal(validateGateForm(form), null);
  for (const changes of [{ staticIp: '192.168.1.999' }, { port: '1.2' }, { exitDoorNo: '2' }, { model: 'MB20' }, { branchId: '' }]) {
    assert.ok(validateGateForm({ ...form, ...changes }));
  }
});
test('exports a complete setup without inventing addresses or storing secrets', () => {
  const result = buildGateSetup({ id: 7, model: 'INBIO160-PRO', staticIp: '192.168.1.202', port: 4370 }, 'one80g_test', 'https://one80.example');
  assert.equal(result.apiBaseUrl, 'https://one80.example/api');
  assert.equal(result.controllerId, 7);
  assert.equal(result.controllerIp, '192.168.1.202');
  assert.equal(result.controllerModel, 'INBIO160-PRO');
  assert.equal(result.agentToken, 'one80g_test');
});
