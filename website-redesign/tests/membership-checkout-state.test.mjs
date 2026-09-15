import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../src/membership-checkout.js', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/, '');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function checkout(api) {
  const node = () => ({ hidden: false, disabled: false, value: '7', textContent: '', innerHTML: '', classList: { add() {}, remove() {} } });
  const nodes = Object.fromEntries(['checkoutState', 'membershipCheckoutForm', 'checkoutBranch', 'paymentMethod', 'paymentDestination', 'packageSummary', 'backToPackage'].map((id) => [id, node()]));
  const button = node();
  const form = nodes.membershipCheckoutForm;
  form.hidden = true;
  form.querySelector = () => button;
  form.reportValidity = () => true;
  form.elements = { proof: { files: [{ type: 'image/png', size: 40 }] } };
  form.addEventListener = (_, handler) => { form.submit = handler; };
  vm.runInNewContext(source, {
    location: { search: '?packageId=42&branchId=1' }, URLSearchParams,
    document: { querySelector: (selector) => nodes[selector.slice(1)] },
    api, escapeHtml: String, money: String,
    FormData: class { set() {} },
  });
  return { nodes, form, button };
}
const home = { branches: [{ id: 1, name: 'الأول' }, { id: 2, name: 'الثاني' }] };
const pkg = { id: 42, name: 'شهر', price: 500 };
const methods = [{ id: 7, name: 'تحويل', destination: '01123456789' }];
const initialApi = (path) => Promise.resolve(path === '/home' ? home : path.startsWith('/payment-methods') ? methods : pkg);

test('invalid proof exposes the error after the loading message has been hidden', async () => {
  const { nodes, form } = checkout(initialApi);
  await flush();
  assert.equal(nodes.checkoutState.hidden, true);
  form.elements.proof.files = [{ type: 'image/svg+xml', size: 10 }];
  await form.submit({ preventDefault() {} });
  assert.equal(nodes.checkoutState.hidden, false);
  assert.match(nodes.checkoutState.textContent, /PDF/);
});

test('server rejection is visible and permits a corrected retry', async () => {
  const { nodes, form, button } = checkout((path) => path === '/online-memberships' ? Promise.reject(new Error('تعذر قبول الإثبات')) : initialApi(path));
  await flush();
  await form.submit({ preventDefault() {} });
  assert.equal(nodes.checkoutState.hidden, false);
  assert.match(nodes.checkoutState.textContent, /الإثبات/);
  assert.equal(button.disabled, false);
  assert.equal(form.hidden, false);
});

test('changing branches disables stale payment submission until the new branch loads', async () => {
  const { nodes, button } = checkout((path) => path === '/memberships/42?branchId=2' ? new Promise(() => {}) : initialApi(path));
  await flush();
  assert.equal(button.disabled, false);
  nodes.checkoutBranch.value = '2';
  nodes.checkoutBranch.onchange();
  assert.equal(button.disabled, true);
  assert.equal(nodes.paymentMethod.disabled, true);
  assert.equal(nodes.paymentDestination.textContent, '');
});

test('a slow earlier branch response cannot replace the latest payment destination', async () => {
  let resolveEarlier;
  let packageOneCalls = 0;
  const { nodes } = checkout((path) => {
    if (path === '/memberships/42?branchId=2') return new Promise((resolve) => { resolveEarlier = resolve; });
    if (path === '/memberships/42?branchId=1') packageOneCalls++;
    return initialApi(path);
  });
  await flush();
  nodes.checkoutBranch.value = '2';
  const earlier = nodes.checkoutBranch.onchange();
  nodes.checkoutBranch.value = '1';
  await nodes.checkoutBranch.onchange();
  resolveEarlier({ ...pkg, name: 'باقة فرع قديم', price: 800 });
  await earlier;
  assert.equal(packageOneCalls, 2);
  assert.equal(nodes.packageSummary.textContent, 'شهر — 500');
});
