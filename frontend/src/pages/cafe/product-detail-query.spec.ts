import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

// Exercise the actual page call and shared hook using React Query's observer.
const hooks = ts.createSourceFile('api-hooks.ts', readFileSync(new URL('../../lib/api-hooks.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const hook = hooks.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'useResource')!;
const hookJs = ts.transpile(hook.getText(hooks).replace('export ', ''), { target: ts.ScriptTarget.ES2022 });

for (const path of ['./products.tsx', '../../../../caffe/frontend/src/pages/cafe/products.tsx']) {
  const page = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let call = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(page) === 'detailQuery') call = node.initializer!.getText(page);
    ts.forEachChild(node, visit);
  };
  visit(page);
  const callJs = ts.transpile(`const result = ${call};`, { target: ts.ScriptTarget.ES2022 });

  test(`${path}: details stay idle until edit and stop after closing`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const requests: string[] = [];
    const detail = { id: 7, recipes: [], variants: [] };
    const api = { get: async (url: string) => {
      requests.push(url);
      return { data: url === '/cafe-products/7' ? detail : { data: [], total: 0 } };
    } };
    const options = (editingId: number | null) => new Function('useQuery', 'api', 'editingId', `${hookJs}\n${callJs}\nreturn result;`)((value: unknown) => value, api, editingId);
    const observer = new QueryObserver(client, options(null));
    const unsubscribe = observer.subscribe(() => {});
    try {
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(requests, [], 'page must not load the collection as product details');
      assert.equal(observer.getCurrentResult().data, undefined);
      observer.setOptions(options(7));
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(requests, ['/cafe-products/7']);
      assert.deepEqual(observer.getCurrentResult().data, detail);
      observer.setOptions(options(null));
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(requests, ['/cafe-products/7']);
      assert.equal(observer.getCurrentResult().data, undefined);
    } finally {
      unsubscribe();
      client.clear();
    }
  });
}
