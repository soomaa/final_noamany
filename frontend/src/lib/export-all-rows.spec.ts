import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from './api';
import { fetchAllListRows } from './export-all-rows';
import type { ListQueryParams } from './use-list-query';

const params: ListQueryParams = {
  page: 3,
  pageSize: 10,
  search: 'ahmed',
  filters: { status: 'active' },
};

/** Stands in for the endpoint, recording the pageSize/page each request asked for. */
function stubEndpoint(total: number, serverCap: number) {
  const calls: Array<Record<string, unknown>> = [];
  const original = api.get;
  api.get = (async (_url: string, config?: { params?: Record<string, unknown> }) => {
    const asked = config?.params ?? {};
    calls.push(asked);
    const pageSize = Math.min(serverCap, Number(asked.pageSize) || 25);
    const page = Number(asked.page) || 1;
    const start = (page - 1) * pageSize;
    return {
      data: {
        data: Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) => ({ id: start + i + 1 })),
        total,
        page,
        pageSize,
      },
    };
  }) as typeof api.get;
  return { calls, restore: () => { api.get = original; } };
}

test('pulls every page, not just the one on screen', async () => {
  const stub = stubEndpoint(1150, 500);
  try {
    const rows = await fetchAllListRows<{ id: number }>('club-subscriptions', params);
    assert.equal(rows.length, 1150);
    assert.deepEqual(rows.slice(0, 2).map((r) => r.id), [1, 2]);
    assert.equal(rows.at(-1)?.id, 1150);
    assert.deepEqual(stub.calls.map((call) => call.page), [1, 2, 3]);
  } finally {
    stub.restore();
  }
});

test('follows the page size the endpoint actually applied', async () => {
  const stub = stubEndpoint(230, 50);
  try {
    const rows = await fetchAllListRows<{ id: number }>('club-subscriptions/reports', params);
    assert.equal(rows.length, 230);
    assert.equal(stub.calls.length, 5);
    assert.deepEqual(stub.calls.slice(1).map((call) => call.pageSize), [50, 50, 50, 50]);
  } finally {
    stub.restore();
  }
});

test('keeps the active filters and search, and ignores the on-screen page', async () => {
  const stub = stubEndpoint(3, 500);
  try {
    await fetchAllListRows('club-members', params);
    assert.equal(stub.calls[0].status, 'active');
    assert.equal(stub.calls[0].search, 'ahmed');
    assert.equal(stub.calls[0].page, 1);
  } finally {
    stub.restore();
  }
});

test('stops cleanly on an empty result set', async () => {
  const stub = stubEndpoint(0, 500);
  try {
    assert.deepEqual(await fetchAllListRows('club-members', params), []);
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});
