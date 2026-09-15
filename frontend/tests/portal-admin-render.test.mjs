import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const temp = await mkdtemp(path.join(tmpdir(), 'portal-admin-render-'));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs',
  outfile: path.join(temp, 'render.cjs'), logLevel: 'silent',
  stdin: { resolveDir: root, contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { PortalManagementPage } from './src/pages/portal-management/index.tsx';
    import { PaymentMethodsPage } from './src/pages/portal/payment-methods.tsx';
    import { OnlineSubscriptionsPage } from './src/pages/club/online-subscriptions.tsx';
    export { fetchAllPreviewBadges, productPreviewBadgeState, selectPortalDraftFields, createPortalRecordPayload, createPortalSettingsPayload, fieldsForSectionSetting } from './src/pages/portal-management/index.tsx';
    export function render(page, queries, pathname = '/portal/company') {
      globalThis.portalTest = { queries, pathname };
      return renderToStaticMarkup(React.createElement({ cms: PortalManagementPage, payments: PaymentMethodsPage, online: OnlineSubscriptionsPage }[page]));
    }
    export function editorIdentity(pathname) {
      globalThis.portalTest = {queries: {}, pathname};
      return PortalManagementPage().key;
    }
  ` },
  plugins: [{ name: 'external-boundaries', setup(builder) {
    const sources = {
      '@tanstack/react-query': `export const useQuery = ({queryKey}) => globalThis.portalTest.queries[queryKey[0]] ?? {data: undefined, isLoading: false, isError: false}; export const useMutation = () => ({isPending: false}); export const useQueryClient = () => ({invalidateQueries() {}});`,
      '@/lib/api': `export const api = {}; export const apiError = error => error.message;`,
      '@/store/locale': `export const useLocale = () => ({ui: text => text, t: text => text, locale: 'ar'});`,
      '@/store/auth': `export const useAuth = () => ({user: null});`,
      'react-router-dom': `export const useLocation = () => ({pathname: globalThis.portalTest.pathname});`,
    };
    builder.onResolve({filter: /^(?:@tanstack\/react-query|@\/lib\/api|@\/store\/(?:locale|auth)|react-router-dom)$/}, args => ({path: args.path, namespace: 'boundary'}));
    builder.onLoad({filter: /.*/, namespace: 'boundary'}, args => ({contents: sources[args.path]}));
  }}],
});
const { render, editorIdentity, fetchAllPreviewBadges, productPreviewBadgeState, selectPortalDraftFields, createPortalRecordPayload, createPortalSettingsPayload, fieldsForSectionSetting } = createRequire(import.meta.url)(path.join(temp, 'render.cjs'));
const failure = { isError: true, isLoading: false, error: new Error('Connection unavailable'), refetch() {} };

for (const [route, query] of [['company', 'portal-setting'], ['sliders', 'portal-records'], ['captain-sales-report', 'portal-captain-report']]) {
  test(`CMS ${route} exposes load failure with retry instead of empty editable content`, () => {
    const html = render('cms', { [query]: failure }, `/portal/${route}`);
    assert.match(html, /Connection unavailable/);
    assert.match(html, /errors.retry/);
    assert.doesNotMatch(html, /لا توجد بيانات|لا توجد مبيعات مكتملة/);
  });
}

test('payment branch-options failure exposes recovery', () => {
  const html = render('payments', { 'portal-payment-method-options': failure });
  assert.match(html, /Connection unavailable/);
  assert.match(html, /errors.retry/);
});

test('online subscription branch-options failure exposes recovery', () => {
  const html = render('online', { 'online-subscriptions-options': failure });
  assert.match(html, /Connection unavailable/);
  assert.match(html, /errors.retry/);
});

test('changing CMS routes resets the editor identity so drafts cannot be saved to another section', () => {
  assert.notEqual(editorIdentity('/portal/company'), editorIdentity('/portal/about'));
  assert.notEqual(editorIdentity('/portal/photos'), editorIdentity('/portal/sliders'));
  assert.notEqual(editorIdentity('/portal/messages'), editorIdentity('/portal/messages-read'));
});

test('CMS text-field labels are programmatically associated with their inputs', () => {
  const html = render('cms', {});
  const label = html.match(/<label[^>]*for="([^"]+)"[^>]*>اسم البرنامج/);
  assert.ok(label, 'The visible company-name label must identify its input');
  assert.ok(html.includes(`id="${label[1]}"`));
});

test('visual settings render the private preview workspace while operational reports do not', () => {
  const visual = render('cms', {}, '/portal/company');
  assert.match(visual, /معاينة خاصة — غير منشورة/);
  assert.match(visual, /التعديل/);
  assert.match(visual, /المعاينة/);
  assert.match(visual, /عرض سطح المكتب/);
  assert.match(visual, /عرض الهاتف/);
  const operational = render('cms', {}, '/portal/captain-sales-report');
  assert.doesNotMatch(operational, /معاينة خاصة — غير منشورة/);
});

test('saved products expose accessible detail and catalog preview surfaces', async () => {
  const source = await readFile(new URL('../src/components/portal/portal-live-preview.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label="سطح معاينة المنتج"/);
  assert.match(source, /aria-pressed=\{productSurface === 'product'\}/);
  assert.match(source, /معاينة التفاصيل/);
  assert.match(source, /aria-pressed=\{productSurface === 'shop'\}/);
  assert.match(source, /معاينة المتجر/);
});

test('section settings expose only fields backed by the selected public DOM target', () => {
  const fields = ['title','sectionKey','subtitle','extraText','details','image','linkText','linkUrl','displayOrder'].map(key => ({ key }));
  assert.deepEqual(fieldsForSectionSetting(fields, 'offers').map(field => field.key), ['title','sectionKey','subtitle','extraText','details','displayOrder']);
  assert.deepEqual(fieldsForSectionSetting(fields, 'hero').map(field => field.key), ['title','sectionKey','subtitle','extraText','details','image','linkText','linkUrl','displayOrder']);
  assert.deepEqual(fieldsForSectionSetting(fields, 'lead').map(field => field.key), ['title','sectionKey','subtitle','extraText','linkText','displayOrder']);
});

test('product preview resolves a selected badge beyond the default first page before exposing any rows', async () => {
  const calls = [];
  const pages = new Map([
    [1, { items: Array.from({ length: 100 }, (_, index) => ({ id: index + 1, title: `شارة ${index + 1}`, status: 'active', isActive: true, data: {} })), total: 126, page: 1, pageSize: 100 }],
    [2, { items: Array.from({ length: 26 }, (_, index) => ({ id: index + 101, title: `شارة ${index + 101}`, status: 'active', isActive: true, data: { nameEn: 'Complete badge', badgeType: 'featured', backgroundColor: '#112233', textColor: '#ffffff' } })), total: 126, page: 2, pageSize: 100 }],
  ]);
  const badges = await fetchAllPreviewBadges(async (page, pageSize) => { calls.push([page, pageSize]); return pages.get(page); });
  assert.deepEqual(calls, [[1, 100], [2, 100]]);
  assert.equal(badges.length, 126);
  assert.equal(badges[125].nameEn, 'Complete badge');
  assert.equal(badges[125].type, 'featured');
});

test('selected product badges block snapshots while rich badge data is loading or unavailable', () => {
  assert.equal(productPreviewBadgeState('26', undefined, true, false), 'loading');
  assert.equal(productPreviewBadgeState('26', undefined, false, true), 'error');
  assert.equal(productPreviewBadgeState('26', [{ id: 26 }], false, false), 'ready');
  assert.equal(productPreviewBadgeState('', undefined, false, false), 'ready');
});

test('inactive or absent selected badges are not sent as public product preview badges', async () => {
  const badges = await fetchAllPreviewBadges(async () => ({
    items: [{ id: 26, title: 'شارة غير نشطة', status: 'inactive', isActive: false, data: { nameEn: 'Inactive', badgeType: 'featured', backgroundColor: '#112233', textColor: '#ffffff' } }],
    total: 1, page: 1, pageSize: 100,
  }));
  assert.deepEqual(badges, []);
  assert.equal(productPreviewBadgeState('26', badges, false, false), 'error');
});

test('visual drafts and publish bodies include configured fields only, never raw-row metadata', () => {
  const fields = [{ key: 'title' }, { key: 'price' }, { key: 'selectedBadge' }];
  const raw = { title: 'منتج', price: 150, selectedBadge: '8', id: 44, id_config: 9, publisher: 12, content_type: 'products', futureSensitiveName: 'no', serverResponse: 'no' };
  assert.deepEqual(selectPortalDraftFields(fields, raw, ['status']), { title: 'منتج', price: 150, selectedBadge: '8' });
  assert.deepEqual(createPortalSettingsPayload(fields, raw), { title: 'منتج', price: 150, selectedBadge: '8' });
  assert.deepEqual(createPortalRecordPayload(fields, { ...raw, status: 'active', branchId: 77 }), { title: 'منتج', status: 'active', branchId: null, data: { price: 150, selectedBadge: '8' } });
});

for (const route of ['photos', 'captain-sales-report']) {
  test(`CMS ${route} reports unavailable branch and employee options`, () => {
    const html = render('cms', { 'portal-options': failure }, `/portal/${route}`);
    assert.match(html, /Connection unavailable/);
    assert.match(html, /errors.retry/);
  });
}
