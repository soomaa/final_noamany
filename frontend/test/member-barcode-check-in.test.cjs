const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function desk(permissions) {
  const slots = []; let cursor = 0; let timerId = 0;
  const timers = new Map(); const posts = []; const errors = [];
  const profiles = new Map(['A', 'B'].map((code, index) => [code, {
    member: { id: index + 1, memberCode: code, name: `Member ${code}`, branchId: 2, isActive: true },
    subscriptions: [{ id: index + 20, status: 'active', isLinkedToSessions: true, sessionsCount: 4, sessionsUsed: 0,
      isLinkedToSpa: true, spaCount: 4, spaUsed: 0, inbodyCount: 4, inbodyUsed: 0 }],
    freezes: [], lockerSubscriptions: [], subscriptionCount: 1, lockerSubscriptionCount: 0, suspendedDays: 0, frozenCount: 0,
  }]));
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect() {},
  };
  const api = {
    async get(url, { params }) { return { data: structuredClone(profiles.get(params.code)) }; },
    async post(url, body) {
      posts.push({ url, body });
      if (desk.rejectEntry && url.endsWith('/check-in')) throw Error('Entry denied');
      if (body.subscriptionId) {
        const profile = [...profiles.values()].find((p) => p.member.id === body.memberId);
        profile.subscriptions[0][({ class: 'sessionsUsed', spa: 'spaUsed', inbody: 'inbodyUsed' })[body.attendanceType]] += 1;
      }
      return { data: {} };
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-router-dom': { useNavigate: () => () => {} },
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries() {} }) },
    sonner: { toast: { success() {}, error(message) { errors.push(message); } } },
    axios: { default: { isAxiosError: () => false } },
    '@/lib/api': { api, apiError: (error) => error.message },
    '@/store/locale': { useLocale: () => ({ ui: (text) => text, locale: 'ar' }) },
    '@/store/auth': { useAuth: () => ({ user: { branch: 2 } }) },
    '@/hooks/use-permission': { usePermission: () => ({ can: (permission) => !permissions || permissions.includes(permission) }) },
    '@/hooks/use-branches': { useBranches: () => ({ data: [] }) },
    '@/hooks/use-club-t': { useClubT: () => (text) => text },
    '@/lib/utils': { toArabicDigits: (value) => String(value) },
    '@/lib/formatters': { formatDateTime: String },
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/club/member-attendance-lookup.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, AbortController,
    require(name) { return imports[name] ?? new Proxy({}, { get: (_, key) => String(key) }); },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  function render() { cursor = 0; return module.exports.MemberAttendanceLookup({ autoCheckIn: true }); }
  function all(node, predicate) {
    if (Array.isArray(node)) return node.flatMap((child) => all(child, predicate));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)];
  }
  const input = () => all(render(), (node) => node.type === 'Input')[0];
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return { posts, profiles, errors, render, input, all, flush,
    async scan(code, enter = true) {
      input().props.onChange({ target: { value: code } });
      if (enter) input().props.onKeyDown({ key: 'Enter', preventDefault() {}, currentTarget: { value: code } });
      else { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); }
      await flush();
    },
    async attend(label) {
      const button = all(render(), (node) => node.type === 'Button' && node.props['aria-label'] === label)[0];
      assert.ok(button); assert.equal(button.props.disabled, false);
      button.props.onClick(); await flush();
    },
  };
}

test('barcode entry auto records normal attendance, clears the input and retains the profile until the next scan', async () => {
  const ui = desk(); await ui.scan('A');
  assert.equal(ui.posts.length, 1);
  assert.equal(ui.posts[0].body.attendanceType, 'normal');
  assert.equal(ui.posts[0].body.consumeSession, false);
  assert.equal(ui.input().props.value, '');
  assert.ok(JSON.stringify(ui.render()).includes('Member A'));
  ui.input().props.onChange({ target: { value: 'B' } });
  assert.ok(JSON.stringify(ui.render()).includes('Member A'));
  await ui.scan('B', false);
  assert.equal(ui.posts.length, 2);
  assert.ok(JSON.stringify(ui.render()).includes('Member B'));
  assert.ok(!JSON.stringify(ui.render()).includes('Member A'));
});

test('service buttons send distinct types and update the selected subscription without reloading', async () => {
  const ui = desk(); await ui.scan('A');
  for (const [type, label, field] of [['class', 'تسجيل حضور الحصص', 'sessionsUsed'], ['spa', 'تسجيل حضور السبا', 'spaUsed'], ['inbody', 'تسجيل حضور الإنبودي', 'inbodyUsed']]) {
    await ui.attend(label);
    assert.equal(ui.posts.at(-1).url, '/club-attendance/service-check-in');
    assert.equal(ui.posts.at(-1).body.attendanceType, type);
    assert.equal(ui.posts.at(-1).body.subscriptionId, 20);
    const usage = ui.all(ui.render(), (node) => typeof node.type === 'function' && node.type.name === 'Usage');
    assert.equal(usage[['sessionsUsed', 'spaUsed', 'inbodyUsed'].indexOf(field)].props.used, 1);
    assert.ok(JSON.stringify(ui.render()).includes('Member A'));
  }
});

test('rejected automatic entry reports the error and keeps member details visible', async () => {
  desk.rejectEntry = true;
  try {
    const ui = desk(); await ui.scan('A');
    assert.deepEqual(ui.errors, ['Entry denied']);
    assert.ok(JSON.stringify(ui.render()).includes('Member A'));
  } finally { desk.rejectEntry = false; }
});

test('active subscriptions appear first without mutating the lookup response order', async () => {
  const ui = desk();
  const profile = ui.profiles.get('A');
  profile.subscriptions.unshift({ ...profile.subscriptions[0], id: 21, status: 'expired' });
  await ui.scan('A');
  const rows = ui.all(ui.render(), (node) => node.type === 'tr' && node.props.children?.some((cell) => cell?.props?.children?.type?.name === 'SubStatusBadge'));
  const statuses = rows.map((row) => row.props.children.find((cell) => cell?.props?.children?.type?.name === 'SubStatusBadge').props.children.props.status);
  assert.deepEqual(statuses, ['active', 'expired']);
  assert.deepEqual(profile.subscriptions.map((sub) => sub.id), [21, 20]);
});

test('reception attendance permission exposes the three accessible service icons and records each service', async () => {
  const ui = desk(['club.reception:create']); await ui.scan('A');
  for (const label of ['تسجيل حضور الحصص', 'تسجيل حضور السبا', 'تسجيل حضور الإنبودي']) {
    const button = ui.all(ui.render(), (node) => node.type === 'Button' && node.props['aria-label'] === label)[0];
    assert.ok(button); assert.equal(button.props.size, 'icon');
    assert.ok(ui.all(ui.render(), (node) => node.type === 'TooltipContent' && node.props.children === label).length);
    await ui.attend(label);
  }
  assert.deepEqual(ui.posts.slice(1).map((post) => post.body.attendanceType), ['class', 'spa', 'inbody']);
});

test('expired subscriptions and exhausted balances cannot register another service', async () => {
  const ui = desk(['club.reception:create']);
  const subscription = ui.profiles.get('A').subscriptions[0];
  subscription.sessionsUsed = 4; subscription.spaUsed = 4; subscription.inbodyUsed = 4;
  await ui.scan('A');
  const buttons = ui.all(ui.render(), (node) => node.type === 'Button' && node.props['aria-label']?.startsWith('تسجيل حضور'));
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every((button) => button.props.disabled));
});
