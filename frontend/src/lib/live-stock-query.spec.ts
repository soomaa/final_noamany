import assert from 'node:assert/strict';
import test from 'node:test';
import { liveStockQueryOptions, stockListQueryOptions } from './live-stock-query';

test('a mounted stock view fetches external sales every minute and again on focus', async (t) => {
  // QueryObserver enables its interval only in a browser environment.
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  const { QueryClient, QueryObserver, focusManager } = await import('@tanstack/query-core');
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.mount();
  focusManager.setFocused(true);
  let serverStock = 165;
  let requests = 0;
  const observer = new QueryObserver(client, {
    ...liveStockQueryOptions,
    queryKey: ['products', 'water'],
    queryFn: async () => { requests++; return serverStock; },
  });
  const unsubscribe = observer.subscribe(() => {});
  const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  try {
    await flush();
    assert.equal(observer.getCurrentResult().data, 165);
    serverStock = 176;
    t.mock.timers.tick(59_999); await flush();
    assert.equal(observer.getCurrentResult().data, 165);
    t.mock.timers.tick(1); await flush();
    assert.equal(observer.getCurrentResult().data, 176);
    assert.equal(requests, 2);
    focusManager.setFocused(false);
    serverStock = 169;
    t.mock.timers.tick(60_000); await flush();
    assert.equal(requests, 2);
    focusManager.setFocused(true); await flush();
    assert.equal(observer.getCurrentResult().data, 169);
  } finally {
    unsubscribe(); client.unmount(); client.clear(); focusManager.setFocused(undefined);
    t.mock.timers.reset();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('stock polling is limited to inventory lists, leaving invoice edit snapshots alone', () => {
  for (const resource of ['products', 'cafe-products', 'stock', 'product-branches']) {
    assert.deepEqual(stockListQueryOptions(resource), liveStockQueryOptions);
  }
  for (const resource of ['quick-sales', 'employees', 'suppliers']) {
    assert.deepEqual(stockListQueryOptions(resource), {});
  }
});
