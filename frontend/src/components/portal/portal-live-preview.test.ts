import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

const temp = await mkdtemp(path.join(tmpdir(), 'portal-live-preview-'));
process.on('exit', () => void rm(temp, { recursive: true, force: true }));
await build({
  absWorkingDir: path.resolve(import.meta.dirname, '../..'), bundle: true, platform: 'node', format: 'cjs',
  outfile: path.join(temp, 'preview.cjs'), logLevel: 'silent',
  stdin: { resolveDir: path.resolve(import.meta.dirname), contents: `export * from './portal-live-preview.tsx';` },
  loader: { '.css': 'text' },
});
const { PortalPreviewSender, createPortalDraftKey, createPreviewUrl, publishPortalDraft, readPortalDraft, removePortalDraft, restorePortalDraft, writePortalDraft } = createRequire(import.meta.url)(path.join(temp, 'preview.cjs'));

const lifecycleTemp = await mkdtemp(path.join(tmpdir(), 'portal-live-preview-lifecycle-'));
process.on('exit', () => void rm(lifecycleTemp, { recursive: true, force: true }));
await build({
  absWorkingDir: path.resolve(import.meta.dirname, '../..'), bundle: true, platform: 'node', format: 'cjs',
  outfile: path.join(lifecycleTemp, 'preview.cjs'), logLevel: 'silent',
  stdin: { resolveDir: path.resolve(import.meta.dirname), contents: `export { PortalLivePreview } from './portal-live-preview.tsx';` }, loader: { '.css': 'text' },
  plugins: [{ name: 'lifecycle-react', setup(builder) {
    const sources: Record<string, string> = {
      react: `const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i])); const hook=(kind,init)=>{const s=globalThis.portalLifecycle;const i=s.index++;if(!s.hooks[i])s.hooks[i]=init(i);return s.hooks[i]}; export const useRef=initial=>hook('ref',i=>({current:i===1?globalThis.portalLifecycle.frame:initial})); export const useMemo=(fn,deps)=>{const r=hook('memo',()=>({deps:null,value:undefined}));if(!same(r.deps,deps)){r.deps=deps;r.value=fn()}return r.value}; export const useState=initial=>{const r=hook('state',()=>({value:typeof initial==='function'?initial():initial}));return [r.value,v=>{r.value=typeof v==='function'?v(r.value):v}]}; export const useEffect=(fn,deps)=>{const r=hook('effect',()=>({deps:null,cleanup:null}));if(!same(r.deps,deps)){r.cleanup?.();r.deps=deps;r.cleanup=fn()}};`,
      'react/jsx-runtime': `export const Fragment=Symbol.for('fragment'); export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;`,
      'lucide-react': `export const Monitor=()=>null; export const RefreshCw=()=>null; export const Smartphone=()=>null; export const Maximize2=()=>null;`,
      '@/components/ui/button': `export const Button=()=>null;`,
    };
    builder.onResolve({filter: /^(?:react|react\/jsx-runtime|lucide-react|@\/components\/ui\/button)$/}, args => ({ path: args.path, namespace: 'lifecycle' }));
    builder.onLoad({filter: /.*/, namespace: 'lifecycle'}, args => ({ contents: sources[args.path], loader: 'js' }));
  }}],
});
const { PortalLivePreview } = createRequire(import.meta.url)(path.join(lifecycleTemp, 'preview.cjs'));

function currentLifecycleSender(): any {
  return (globalThis as any).portalLifecycle.hooks
    .map((hook: any) => hook?.current)
    .find((value: any) => value?.session?.nonce);
}

test('namespaces device-local field-only drafts by type and entity', () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  };
  const key = createPortalDraftKey('products', 12);
  assert.equal(key, 'noamany:portal-draft:products:12');
  writePortalDraft(storage, key, { title: 'مسودة', token: 'must-not-store', accessToken: 'secret', refreshToken: 'secret', serverResponse: { token: 'secret' }, meta: { apiResponse: 'secret', safe: 'يبقى' } });
  assert.deepEqual(readPortalDraft(storage, key), { title: 'مسودة', meta: { safe: 'يبقى' } });
  removePortalDraft(storage, key);
  assert.equal(readPortalDraft(storage, key), null);
});

test('local draft restore and discard preserve the baseline while publish clears only after a successful API call', async () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) };
  const key = createPortalDraftKey('products', 12);
  const baseline = { title: 'المنشور', price: 100 };
  writePortalDraft(storage, key, { title: 'محلي' });
  assert.deepEqual(restorePortalDraft(storage, key, baseline), { values: { title: 'محلي', price: 100 }, restored: true });
  removePortalDraft(storage, key);
  assert.deepEqual(restorePortalDraft(storage, key, baseline), { values: baseline, restored: false });
  writePortalDraft(storage, key, { title: 'محلي' });
  let apiCalls = 0;
  await assert.rejects(() => publishPortalDraft(storage, key, async () => { apiCalls++; throw new Error('failed'); }));
  assert.equal(apiCalls, 1);
  assert.deepEqual(readPortalDraft(storage, key), { title: 'محلي' });
  writePortalDraft(storage, key, { title: 'محلي آخر' });
  assert.equal(apiCalls, 1, 'local saves only write storage and never call the publish API');
  await publishPortalDraft(storage, key, async () => { apiCalls++; return { ok: true }; });
  assert.equal(apiCalls, 2);
  assert.equal(readPortalDraft(storage, key), null);
});

test('React draft rerenders preserve the ready sender and emit increasing snapshots without an iframe reload', () => {
  const sent: any[] = [];
  const listeners = new Set<(event: MessageEvent) => void>();
  const frame = { postMessage: (message: any) => sent.push(message) };
  (globalThis as any).portalLifecycle = { hooks: [], index: 0, frame: { contentWindow: frame } };
  (globalThis as any).window = { location: { origin: 'http://127.0.0.1:5175' }, addEventListener: (_: string, listener: (event: MessageEvent) => void) => listeners.add(listener), removeEventListener: (_: string, listener: (event: MessageEvent) => void) => listeners.delete(listener), setTimeout: () => 1, clearTimeout: () => {} };
  const render = (draft: Record<string, unknown>) => { (globalThis as any).portalLifecycle.index = 0; PortalLivePreview({ configType: 'products', entityId: 12, draft, surfaceLabel: 'المنتجات', children: null }); };
  render({ title: 'الأول' });
  const sender = currentLifecycleSender();
  for (const listener of listeners) listener({ data: { type: 'noamany:preview-ready', version: 1, nonce: sender.session.nonce }, origin: sender.session.targetOrigin, source: frame } as unknown as MessageEvent);
  render({ title: 'الثاني' });
  assert.deepEqual(sent.map(message => message.sequence), [1, 2]);
});

test('toolbar reload queues the unchanged latest draft for the fresh iframe handshake', () => {
  const sent: any[] = [];
  const listeners = new Set<(event: MessageEvent) => void>();
  const frame = { postMessage: (message: any) => sent.push(message) };
  const unchangedDraft = { title: 'يبقى بعد التحديث' };
  (globalThis as any).portalLifecycle = { hooks: [], index: 0, frame: { contentWindow: frame } };
  (globalThis as any).window = { location: { origin: 'http://127.0.0.1:5175' }, addEventListener: (_: string, listener: (event: MessageEvent) => void) => listeners.add(listener), removeEventListener: (_: string, listener: (event: MessageEvent) => void) => listeners.delete(listener), setTimeout: () => 1, clearTimeout: () => {} };
  const render = () => {
    (globalThis as any).portalLifecycle.index = 0;
    return PortalLivePreview({ configType: 'products', entityId: 12, draft: unchangedDraft, surfaceLabel: 'المنتجات', children: null });
  };
  const findByLabel = (node: any, label: string): any => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.['aria-label'] === label) return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findByLabel(child, label);
      if (found) return found;
    }
    return null;
  };
  const firstTree = render();
  let sender = currentLifecycleSender();
  for (const listener of [...listeners]) listener({ data: { type: 'noamany:preview-ready', version: 1, nonce: sender.session.nonce }, origin: sender.session.targetOrigin, source: frame } as unknown as MessageEvent);
  assert.equal(sent.length, 1);
  findByLabel(firstTree, 'إعادة تحميل المعاينة').props.onClick();
  render();
  sender = currentLifecycleSender();
  for (const listener of [...listeners]) listener({ data: { type: 'noamany:preview-ready', version: 1, nonce: sender.session.nonce }, origin: sender.session.targetOrigin, source: frame } as unknown as MessageEvent);
  assert.deepEqual(sent.map(message => message.draft.name), ['يبقى بعد التحديث', 'يبقى بعد التحديث']);
});

test('mobile preview tabs expose complete ARIA relationships, keyboard navigation, and a geometric loading skeleton', () => {
  const listeners = new Set<(event: MessageEvent) => void>();
  const frame = { postMessage: () => {} };
  (globalThis as any).portalLifecycle = { hooks: [], index: 0, frame: { contentWindow: frame } };
  (globalThis as any).window = { location: { origin: 'http://127.0.0.1:5175' }, addEventListener: (_: string, listener: (event: MessageEvent) => void) => listeners.add(listener), removeEventListener: (_: string, listener: (event: MessageEvent) => void) => listeners.delete(listener), setTimeout: () => 1, clearTimeout: () => {} };
  (globalThis as any).document = { getElementById: () => ({ focus() {} }) };
  const render = () => { (globalThis as any).portalLifecycle.index = 0; return PortalLivePreview({ configType: 'products', entityId: 'new', draft: {}, surfaceLabel: 'المنتجات', children: null }); };
  const findAll = (node: any, predicate: (candidate: any) => boolean, found: any[] = []): any[] => {
    if (!node || typeof node !== 'object') return found;
    if (predicate(node)) found.push(node);
    for (const child of Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]) findAll(child, predicate, found);
    return found;
  };
  const loadingTree = render();
  assert.equal(loadingTree.props['data-preview-state'], 'loading');
  assert.equal(loadingTree.props['data-preview-new-record'], 'true');
  const tabs = findAll(loadingTree, node => node.props?.role === 'tab');
  assert.equal(tabs.length, 2);
  assert.ok(tabs.every(tab => typeof tab.props['aria-controls'] === 'string'));
  assert.equal(findAll(loadingTree, node => node.props?.role === 'tabpanel').length, 2);
  assert.ok(findAll(loadingTree, node => String(node.props?.className).includes('is-skeleton')).length > 0);
  tabs[1].props.onKeyDown({ key: 'Home', preventDefault() {} });
  const afterHome = render();
  assert.equal(findAll(afterHome, node => node.props?.role === 'tab')[0].props['aria-selected'], true);
  tabs[0].props.onKeyDown({ key: 'End', preventDefault() {} });
  const afterEnd = render();
  assert.equal(findAll(afterEnd, node => node.props?.role === 'tab')[1].props['aria-selected'], true);
});

test('a late iframe load event cannot replace an already validated ready state with a stale loading overlay', () => {
  const listeners = new Set<(event: MessageEvent) => void>();
  const frame = { postMessage: () => {} };
  (globalThis as any).portalLifecycle = { hooks: [], index: 0, frame: { contentWindow: frame } };
  (globalThis as any).window = { location: { origin: 'http://127.0.0.1:5175' }, addEventListener: (_: string, listener: (event: MessageEvent) => void) => listeners.add(listener), removeEventListener: (_: string, listener: (event: MessageEvent) => void) => listeners.delete(listener), setTimeout: () => 1, clearTimeout: () => {} };
  const render = () => {
    (globalThis as any).portalLifecycle.index = 0;
    return PortalLivePreview({ configType: 'products', entityId: 12, draft: { title: 'جاهز' }, surfaceLabel: 'المنتجات', children: null });
  };
  const find = (node: any, predicate: (candidate: any) => boolean): any => {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  };
  render();
  const sender = currentLifecycleSender();
  for (const listener of [...listeners]) listener({ data: { type: 'noamany:preview-ready', version: 1, nonce: sender.session.nonce }, origin: sender.session.targetOrigin, source: frame } as unknown as MessageEvent);
  const readyTree = render();
  find(readyTree, (node) => node.type === 'iframe').props.onLoad?.();
  const afterLateLoad = render();
  assert.equal(find(afterLateLoad, (node) => node.props?.className === 'portal-live-preview__state'), null);
});

test('preview URL carries a nonce and sender queues until the matching ready handshake', () => {
  const url = createPreviewUrl('http://127.0.0.1:5175', '/shop.html', 'nonce-1');
  assert.equal(url, 'http://127.0.0.1:5175/shop.html?cmsPreview=1&previewNonce=nonce-1');
  const sent: Array<{ message: any; origin: string }> = [];
  const frame = { postMessage: (message: any, origin: string) => sent.push({ message, origin }) };
  const sender = new PortalPreviewSender({ nonce: 'nonce-1', targetOrigin: 'http://127.0.0.1:5175', frame });
  sender.queue({ surface: 'shop', entityType: 'products', entityId: 12, draft: { title: 'قبل الجاهزية' } });
  assert.equal(sent.length, 0);
  assert.equal(sender.receiveReady({ data: { type: 'noamany:preview-ready', version: 1, nonce: 'wrong' }, origin: 'http://127.0.0.1:5175', source: frame } as unknown as MessageEvent), false);
  assert.equal(sent.length, 0);
  assert.equal(sender.receiveReady({ data: { type: 'wrong-ready', version: 1, nonce: 'nonce-1' }, origin: 'http://127.0.0.1:5175', source: frame } as unknown as MessageEvent), false);
  assert.equal(sender.receiveReady({ data: { type: 'noamany:preview-ready', version: 2, nonce: 'nonce-1' }, origin: 'http://127.0.0.1:5175', source: frame } as unknown as MessageEvent), false);
  assert.equal(sender.receiveReady({ data: { type: 'noamany:preview-ready', version: 1, nonce: 'nonce-1' }, origin: 'http://127.0.0.1:5175', source: frame } as unknown as MessageEvent), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].origin, 'http://127.0.0.1:5175');
  assert.equal(sent[0].message.sequence, 1);
  assert.equal(sent[0].message.version, 1);
  sender.queue({ surface: 'shop', entityType: 'products', entityId: 12, draft: { title: 'تحديث' } });
  assert.equal(sent[1].message.sequence, 2);
});
