import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardShortcutPages } from './dashboard-shortcuts';
import type { NavApiNode } from '../hooks/use-permission';

const page = (route: string, options: Partial<NavApiNode> = {}): NavApiNode => ({
  key: route, nameAr: 'المصروفات', nameEn: 'Expenses', route, icon: null,
  type: 'page', clickable: true, children: [], ...options,
});

test('catalog traversal includes new pages, respects grants, and never offers the dashboard or duplicates', () => {
  const nodes = [page('/hub/club', { type: 'module', nameAr: 'الجيم', clickable: false, children: [
    page('/finance/expenses'), page('/finance/revenues', { clickable: false }),
    page('/finance/expenses'), page('/dashboard'), page('/new-page'), page('/forbidden-page'),
  ] })];
  const pages = dashboardShortcutPages(nodes, 'ar', (to) => to !== '/forbidden-page');
  assert.deepEqual(pages.map(({ to }) => to), ['/finance/expenses', '/new-page']);
  assert.equal(pages[0].section, 'الجيم');
  assert.equal(pages[0].label, 'المصروفات');
  assert.equal(dashboardShortcutPages(nodes, 'en', () => true)[0].label, 'Expenses');
});
