/*
 * The sender. Loop: ask the gym system for the next message (it asks the control service for a permit) →
 * open the chat in the WhatsApp Web tab → content.js presses Send and confirms → report →
 * wait the delay the permit dictated. Limits, hours and the kill switch are all server-side;
 * this file only follows orders and stops on anything it doesn't understand.
 */
const $ = (id) => document.getElementById(id);
const WA_ORIGIN = 'https://web.whatsapp.com';
const REASONS = {
  not_on_whatsapp: 'الرقم مش على واتساب',
  logged_out: 'واتساب ويب مش مسجل دخول',
  compose_timeout: 'الشات ما فتحش',
  compose_failed: 'ما قدرش يكتب الرسالة',
  send_button_failed: 'زرار الإرسال ما اشتغلش',
  send_timeout: 'مش متأكد إنها اتبعتت',
  page_not_ready: 'صفحة واتساب ما جهزتش',
  unexpected_dialog: 'ظهرت رسالة غير متوقعة في واتساب',
  pending_ack: 'في طابور واتساب',
  send_error: 'واتساب رفض الإرسال',
};

let cfg = null; // { server, token, device }
let selectors = {};
let running = false;
let wake = null; // resolves the current interruptible wait
let control = null; // last limits/usage from the control service
let mainWindowId = null; // the browser window that holds WhatsApp Web (for the side panel)
const session = { sent: 0, failed: 0, uncertain: 0 };
/** The same page runs as the side panel or as the narrow "column" window (?mini=1). */
const MINI = new URLSearchParams(location.search).has('mini');
/** Side panel ↔ column hand-over, and never two senders at once. */
const channel = new BroadcastChannel('wa-sender');
const pageId = Math.random().toString(36).slice(2);

// ── storage / api ───────────────────────────────────────────────────────────

const store = {
  get: () => chrome.storage.local.get(['cfg']).then((r) => r.cfg || null),
  set: (value) => chrome.storage.local.set({ cfg: value }),
  clear: () => chrome.storage.local.remove(['cfg']),
};

class Unauthorized extends Error {}

async function api(path, { method = 'GET', body, auth = true, server = cfg?.server } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${cfg.token}`;
  let res;
  try {
    res = await fetch(`${server}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('تعذّر الاتصال بالسيستم — اتأكدي من الإنترنت');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) throw new Unauthorized(data.message || 'الجهاز مش مربوط');
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join('، ') : data.message || `خطأ ${res.status}`);
  return data;
}

// ── waits ───────────────────────────────────────────────────────────────────

function pause(seconds, label) {
  return new Promise((resolve) => {
    let left = Math.max(0, Math.round(seconds));
    const tick = () => {
      if (label) setStatus(`${label} — ${left} ث`, 'busy');
      if (left-- <= 0 || !running) return done();
    };
    const timer = setInterval(tick, 1000);
    const done = () => { clearInterval(timer); wake = null; resolve(); };
    wake = done;
    tick();
  });
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]);
}

function waitTabComplete(tabId, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(false); }, ms);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── WhatsApp tab ────────────────────────────────────────────────────────────

async function findWaTab() {
  const tabs = await chrome.tabs.query({ url: `${WA_ORIGIN}/*` });
  if (tabs[0]) mainWindowId = tabs[0].windowId;
  return tabs[0] || null;
}

/** Bring WhatsApp Web to the front (opening it the first time); the column window stays on top. */
async function showWhatsApp() {
  let tab = await findWaTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    const normal = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const target = normal.find((w) => w.focused) || normal[0];
    if (target) {
      tab = await chrome.tabs.create({ windowId: target.id, url: WA_ORIGIN, active: true });
      await chrome.windows.update(target.id, { focused: true });
    } else {
      tab = (await chrome.windows.create({ url: WA_ORIGIN, focused: true })).tabs?.[0];
    }
    if (tab) mainWindowId = tab.windowId;
  }
  if (MINI) {
    const self = await chrome.windows.getCurrent();
    await chrome.windows.update(self.id, { focused: true });
  }
}

async function ping(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'ping', selectors });
  } catch {
    return null; // content script not injected yet
  }
}

async function waitInpage(tabId, seconds) {
  let pong = await ping(tabId);
  for (let i = 0; i < seconds && !pong?.inpage; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    pong = await ping(tabId);
  }
  return !!pong?.inpage;
}

/** Fast path: send inside the open WhatsApp Web (wa-js), no reload. Falls back to the chat link. */
async function sendViaTab(tabId, message) {
  if (await waitInpage(tabId, 3)) {
    const result = await chrome.tabs
      .sendMessage(tabId, { type: 'send-inpage', phone: message.phone, body: message.body })
      .catch(() => ({ status: 'uncertain', reason: 'send_timeout' }));
    if (result?.status !== 'unavailable') return { ...result, via: 'inpage' };
  }
  const result = await sendViaLink(tabId, message);
  // Link path: the composer emptied after Send, so WhatsApp took the message even when its bubble
  // could not be matched on screen. Text left in the box stays a real failure (send_button_failed).
  if (result.status === 'uncertain' && result.reason === 'send_timeout') return { status: 'sent', via: 'link' };
  return { ...result, via: 'link' };
}

/** Fallback: open the chat link (WhatsApp reloads the page) and press Send in the page. */
async function sendViaLink(tabId, message) {
  const url = `${WA_ORIGIN}/send?phone=${encodeURIComponent(message.phone)}&text=${encodeURIComponent(message.body)}`;
  const loaded = waitTabComplete(tabId, 60000);
  await chrome.tabs.update(tabId, { url });
  await loaded;
  // The content script appears with the page; wait until it answers.
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    try {
      const pong = await chrome.tabs.sendMessage(tabId, { type: 'ping', selectors });
      ready = !!pong?.ok;
    } catch { /* not injected yet */ }
    if (!ready) await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) return { status: 'failed', reason: 'page_not_ready' };
  try {
    return await withTimeout(
      chrome.tabs.sendMessage(tabId, { type: 'send', body: message.body, selectors }),
      120000,
      { status: 'uncertain', reason: 'send_timeout' },
    );
  } catch {
    // The page navigated or crashed mid-send: we can't know whether Send was pressed.
    return { status: 'uncertain', reason: 'send_timeout' };
  }
}

// ── loop ────────────────────────────────────────────────────────────────────

async function report(id, result) {
  for (let i = 0; i < 3; i++) {
    try {
      return await api(`/wa-ext/messages/${id}/result`, { method: 'POST', body: { status: result.status, ...(result.reason ? { reason: result.reason } : {}) } });
    } catch (err) {
      if (err instanceof Unauthorized) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  // The server marks an unreported message "needs review" after 10 minutes — never resent blindly.
}

/** The queue is checked again once; empty twice in a row means the campaigns are done. */
const EMPTY_CHECKS_TO_STOP = 2;

async function runLoop() {
  let failuresInRow = 0;
  let emptyChecks = 0;
  while (running) {
    try {
      const tab = await findWaTab();
      if (!tab) {
        setStatus('افتحي web.whatsapp.com الأول', 'warn');
        await pause(5);
        continue;
      }
      setStatus('بيجيب الرسالة الجاية…', 'busy');
      const campaignId = Number($('campaign').value) || undefined;
      const res = await api('/wa-ext/next', { method: 'POST', body: campaignId ? { campaignId } : {} });
      if (res.idle) {
        emptyChecks += 1;
        void refreshState();
        if (emptyChecks >= EMPTY_CHECKS_TO_STOP) return stop('خلصت كل الرسايل اللي في الطابور — الإرسال وقف لوحده ✓', 'done');
        setStatus('مفيش رسايل دلوقتي — هشيك مرة كمان وبعدين أوقف', 'idle');
        await pause(20);
        continue;
      }
      emptyChecks = 0;
      if (res.wait) {
        if (res.code === 'monthly_limit') return stop(`${res.message} — الإرسال وقف. الباقي يتبعت الشهر الجاي أو بعد زيادة الحد`, 'warn');
        if (res.code === 'daily_limit') {
          // A big campaign is split over days by the daily limit: wait quietly and carry on tomorrow.
          setStatus(`${res.message} — الباقي هيتبعت بكرة. سيبي الجهاز والشاشة دي مفتوحين ويكمل لوحده، أو اضغطي تشغيل بكرة`, 'warn');
          setLive(true, 'مستني بكرة');
          void refreshState();
          await pause(Math.min(Math.max(res.retryAfterSec ?? 600, 60), 600));
          if (running) setLive(true);
          continue;
        }
        const seconds = res.retryAfterSec == null ? 60 : Math.min(Math.max(res.retryAfterSec, 3), 300);
        setStatus(res.message, 'warn');
        if (res.code !== 'too_fast') void refreshState();
        await pause(seconds, res.code === 'too_fast' ? 'استني قبل الرسالة الجاية' : res.message);
        continue;
      }

      const m = res.message;
      setStatus(`بيبعت لـ ${m.name}…`, 'busy');
      const result = await sendViaTab(tab.id, m);
      await report(m.id, result);
      addLog(m, result);
      void refreshState(); // keep today/month usage and the campaign counts live while sending

      if (result.stop) return stop('واتساب ويب مش مسجل دخول — امسحي الـ QR وشغّلي تاني', 'error');
      // Invalid numbers are expected; anything else failing three times in a row means trouble.
      failuresInRow = result.status === 'sent' || result.reason === 'not_on_whatsapp' ? 0 : failuresInRow + 1;
      if (failuresInRow >= 3) return stop('3 رسايل ما اتبعتتش ورا بعض — بصّي على واتساب ويب وشغّلي تاني', 'error');

      await pause(res.delaySec ?? 10, 'استني قبل الرسالة الجاية');
    } catch (err) {
      if (err instanceof Unauthorized) {
        running = false;
        await store.clear();
        cfg = null;
        render();
        $('setup-error').textContent = err.message;
        return;
      }
      setStatus(err.message || String(err), 'error');
      await pause(15);
    }
  }
}

function start({ showWa = false } = {}) {
  if (running) return;
  running = true;
  setLive(true);
  channel.postMessage({ type: 'sending', from: pageId });
  if (showWa) void showWhatsApp().catch(() => {});
  void runLoop();
}

function stop(message = 'متوقف', tone = 'idle') {
  running = false;
  wake?.();
  setLive(false);
  setStatus(message, tone);
  return cfg ? api('/wa-ext/release', { method: 'POST' }).catch(() => {}) : Promise.resolve();
}

// ── UI ──────────────────────────────────────────────────────────────────────

function setLive(on, label) {
  $('toggle').textContent = on ? '■ إيقاف الإرسال' : '▶ تشغيل الإرسال';
  $('toggle').className = on ? 'btn danger big' : 'btn primary big';
  $('live').textContent = label || (on ? 'بيبعت' : 'متوقف');
  $('live').className = on ? 'pill on' : 'pill off';
}

function setStatus(text, tone = 'idle') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${tone}`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  for (const c of children) node.append(c);
  return node;
}

function addLog(m, result) {
  session[result.status] = (session[result.status] || 0) + 1;
  $('s-sent').textContent = session.sent;
  $('s-failed').textContent = session.failed;
  $('s-uncertain').textContent = session.uncertain;
  const cls = result.status === 'sent' ? 'ok' : result.status === 'failed' ? 'bad' : 'unsure';
  const why = (r) => REASONS[r] || (r?.startsWith('dialog: ') ? `واتساب عرض: ${r.slice(8)}` : r);
  const label = result.status === 'sent' ? '✓ اتبعتت' : result.status === 'failed' ? `✗ ${why(result.reason)}` : `؟ ${why(result.reason) || 'مراجعة'}`;
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const via = result.via === 'link' ? ' · باللينك' : '';
  const icon = result.status === 'sent' ? '✓' : result.status === 'failed' ? '✗' : '؟';
  $('log').prepend(el('li', { className: cls },
    el('span', { className: 'dot', textContent: icon }),
    el('span', { className: 'who', textContent: m.name }),
    el('span', { className: 'what', textContent: `${time} · ${label.replace(/^[✓✗؟] /, '')}${via}` })));
  applyLogFilter();
  while ($('log').children.length > 200) $('log').lastChild.remove();
}

// ── log filter: the three counters double as filters ───────────────────────

const FILTER_TITLES = { ok: 'الرسايل اللي اتبعتت', bad: 'الرسايل اللي فشلت', unsure: 'رسايل محتاجة مراجعة' };
let logFilter = '';

function applyLogFilter() {
  let shown = 0;
  for (const li of $('log').children) {
    li.hidden = !!logFilter && !li.classList.contains(logFilter);
    if (!li.hidden) shown += 1;
  }
  document.querySelectorAll('.stat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === logFilter)));
  $('log-title').textContent = logFilter ? FILTER_TITLES[logFilter] : 'آخر الرسايل';
  $('log-clear').hidden = !logFilter;
  $('log-empty').hidden = shown > 0;
  $('log-empty').textContent = logFilter ? 'مفيش رسايل من النوع ده في الجلسة دي' : 'لسه مفيش رسايل في الجلسة دي';
}

document.querySelectorAll('.stat').forEach((b) => b.addEventListener('click', () => {
  logFilter = logFilter === b.dataset.filter ? '' : b.dataset.filter;
  applyLogFilter();
}));
$('log-clear').addEventListener('click', () => { logFilter = ''; applyLogFilter(); });

function renderControl(next, error) {
  control = next;
  const box = $('control');
  box.replaceChildren();
  $('mini-today').textContent = control ? `النهارده ${Number(control.usage.today).toLocaleString('ar-EG')} / ${Number(control.dailyLimit).toLocaleString('ar-EG')}` : '';
  if (!control) {
    box.append(el('p', { className: 'error', textContent: error || 'خدمة التحكم مش متاحة' }));
    return;
  }
  const [state, tone] = !control.enabled ? ['الإرسال موقوف من إدارة المنصة', 'off']
    : control.lock ? [`بيبعت دلوقتي من: ${control.lock.label || ''}`, 'busy']
    : control.withinHours ? ['جاهز للإرسال', 'ready']
    : [`برّه مواعيد الإرسال (${control.sendFrom} – ${control.sendTo})`, 'wait'];
  const fmt = (n) => Number(n).toLocaleString('ar-EG');
  const meter = (used, limit) => el('div', { className: used >= limit ? 'meter full' : 'meter' }, el('i', { style: `width:${limit ? Math.min(100, (used / limit) * 100) : 100}%` }));
  box.append(
    el('div', { className: `state ${tone}`, textContent: state }),
    el('div', { className: 'row' }, el('span', { textContent: 'النهارده' }), el('span', { className: 'num', textContent: `${fmt(control.usage.today)} / ${fmt(control.dailyLimit)}` })),
    meter(control.usage.today, control.dailyLimit),
    el('div', { className: 'row' }, el('span', { textContent: 'الشهر ده' }), el('span', { className: 'num', textContent: `${fmt(control.usage.month)} / ${fmt(control.monthlyLimit)}` })),
    meter(control.usage.month, control.monthlyLimit),
    el('span', { className: 'chip', textContent: `⏱ بين كل رسالة والتانية ${control.minDelaySec}–${control.maxDelaySec} ثانية` }),
  );
}

/** How the daily limit spreads a campaign's waiting messages over days (estimate; the limit is per number). */
function dailyPlan(queued) {
  if (!control || !queued || !control.dailyLimit) return null;
  const fmt = (n) => String(n);
  const leftToday = Math.max(0, control.dailyLimit - control.usage.today);
  if (queued <= leftToday) return null;
  if (!leftToday) {
    const days = Math.ceil(queued / control.dailyLimit);
    return { waiting: true, text: `⏸ خلص حد النهارده — الـ ${fmt(queued)} الباقيين هيتبعتوا ${days > 1 ? `من بكرة على ${fmt(days)} أيام (${fmt(control.dailyLimit)} في اليوم)` : 'بكرة'}` };
  }
  const days = Math.ceil((queued - leftToday) / control.dailyLimit);
  return { waiting: false, text: `📅 النهارده ${fmt(leftToday)} والباقي على ${fmt(days)} ${days > 1 ? 'أيام' : 'يوم'} (${fmt(control.dailyLimit)} في اليوم)` };
}

function renderCampaigns(campaigns) {
  const select = $('campaign');
  const keep = select.value;
  select.replaceChildren(el('option', { value: '', textContent: 'كل الحملات الشغالة' }));
  for (const c of campaigns.filter((c) => c.status === 'running')) select.append(el('option', { value: String(c.id), textContent: c.name }));
  select.value = [...select.options].some((o) => o.value === keep) ? keep : '';
  const STATUS = { running: 'شغالة', paused: 'متوقفة', ready: 'مستنية تشغيل' };
  $('campaigns').replaceChildren(...campaigns.map((c) => {
    const total = c.queued + c.sent + c.failed + c.uncertain;
    const done = total - c.queued;
    const plan = c.status === 'running' || c.status === 'ready' ? dailyPlan(c.queued) : null;
    return el('li', {},
      el('div', { className: 'top' }, el('span', { className: 'name', textContent: c.name }), el('span', { className: `badge ${c.status}`, textContent: STATUS[c.status] || c.status })),
      el('div', { className: 'meter' }, el('i', { style: `width:${total ? (done / total) * 100 : 0}%` })),
      el('div', { className: 'sub', textContent: `اتبعت ${c.sent} · فاضل ${c.queued}${c.failed ? ` · فشل ${c.failed}` : ''}` }),
      ...(plan ? [el('div', { className: `sub plan${plan.waiting ? ' waiting' : ''}`, textContent: plan.text })] : []));
  }));
  if (!campaigns.length) $('campaigns').append(el('li', { className: 'none', textContent: 'مفيش حملات — اعمليها من صفحة رسائل واتساب في السيستم' }));
}

async function refreshState() {
  if (!cfg) return;
  try {
    const state = await api('/wa-ext/state');
    selectors = state.control?.selectors || selectors;
    $('device-line').textContent = `${state.device.branchName} — ${state.device.label}`;
    renderControl(state.control, state.controlError);
    renderCampaigns(state.campaigns);
  } catch (err) {
    if (err instanceof Unauthorized) {
      stop();
      await store.clear();
      cfg = null;
      render();
      $('setup-error').textContent = err.message;
    } else renderControl(null, err.message);
  }
}

function render() {
  $('setup').hidden = !!cfg;
  $('main').hidden = !cfg;
  $('live').hidden = !cfg;
  if (!cfg) $('device-line').textContent = '';
}

async function pair() {
  $('setup-error').textContent = '';
  let server = $('server').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(server)) server = `https://${server}`;
  let origin;
  try { origin = new URL(server).origin; } catch { $('setup-error').textContent = 'عنوان السيستم مش صحيح'; return; }
  if (origin.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    $('setup-error').textContent = 'لازم العنوان يبدأ بـ https://';
    return;
  }
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
  if (!granted) { $('setup-error').textContent = 'لازم توافقي على الوصول لعنوان السيستم'; return; }
  $('pair').disabled = true;
  try {
    const res = await api('/wa-ext/pair', { method: 'POST', body: { code: $('code').value }, auth: false, server: origin });
    cfg = { server: origin, token: res.token, device: res.device };
    await store.set(cfg);
    $('code').value = '';
    render();
    await refreshState();
  } catch (err) {
    $('setup-error').textContent = err.message;
  } finally {
    $('pair').disabled = false;
  }
}

/** XXXX-XXXX while typing: uppercase, no ambiguous separators. */
$('code').addEventListener('input', (e) => {
  const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  e.target.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
});

/** Noamany build: the gym system this copy of the extension is handed out for. */
const NOAMANY_SERVER = 'https://final.noamanycenter.com';

/** Pre-fill the system address from an open tab of the gym system (any https tab but WhatsApp), else Noamany's. */
async function suggestServer() {
  if ($('server').value.trim()) return;
  try {
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const tab = tabs.find((t) => /^https:\/\/final\.noamanycenter\.com\//.test(t.url || ''))
      || tabs.find((t) => t.active && /^https:\/\//.test(t.url || '') && !(t.url || '').startsWith(WA_ORIGIN))
      || tabs.find((t) => /^https:\/\/[^/]+\.metacodecx\.com\//.test(t.url || ''));
    $('server').value = tab?.url ? new URL(tab.url).origin : NOAMANY_SERVER;
  } catch { $('server').value = NOAMANY_SERVER; }
}

$('pair').addEventListener('click', () => void pair());
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') void pair(); });
$('toggle').addEventListener('click', () => (running ? stop() : start({ showWa: true })));
$('open-wa').addEventListener('click', () => void showWhatsApp());

// ── column window ⇄ side panel ─────────────────────────────────────────────
// Sending moves with the view: the page that leaves stops and hands over, the new one carries on.

const RESUME_KEY = 'resumeAt';

async function handOver(resume) {
  if (running) await stop('اتنقل للشاشة التانية');
  await chrome.storage.local.set({ [RESUME_KEY]: resume ? Date.now() : 0 });
  channel.postMessage({ type: 'handoff', from: pageId, resume });
}

$('to-mini').addEventListener('click', async () => {
  const resume = running;
  await handOver(resume);
  const width = 250;
  await chrome.windows.create({
    url: chrome.runtime.getURL('sidepanel.html?mini=1'), type: 'popup', focused: true,
    width, height: screen.availHeight, left: (screen.availLeft ?? 0) + screen.availWidth - width, top: screen.availTop ?? 0,
  });
  window.close();
});

$('to-panel').addEventListener('click', () => {
  // sidePanel.open needs the click itself, so it goes first; the hand-over follows.
  const windowId = mainWindowId;
  const opened = windowId != null && chrome.sidePanel?.open ? chrome.sidePanel.open({ windowId }).then(() => true, () => false) : Promise.resolve(false);
  void (async () => {
    if (!(await opened)) return setStatus('افتحي البانل من أيقونة الإضافة جنب شريط العنوان', 'warn');
    await handOver(running);
    window.close();
  })();
});

channel.addEventListener('message', ({ data }) => {
  if (data?.from === pageId) return;
  // Another view started sending (or took over): this one must not send too.
  if (data?.type === 'sending' && running) void stop('الإرسال شغال من الشاشة التانية');
  if (data?.type === 'handoff' && data.resume && cfg && !running) {
    void chrome.storage.local.set({ [RESUME_KEY]: 0 });
    start();
  }
});

/** «إيقاف» / "stop" replies: the gym system checks the number got a campaign message, then stops messaging it. */
const STOP_WORDS = new Set(['ايقاف', 'إيقاف', 'وقف', 'الغاء', 'إلغاء', 'stop', 'unsubscribe']);
const isStopReply = (text) => {
  const words = String(text || '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 3 && words.some((w) => STOP_WORDS.has(w));
};
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'incoming-reply' || !cfg || !isStopReply(msg.text)) return;
  api('/wa-ext/stop-reply', { method: 'POST', body: { phone: msg.phone, text: msg.text } })
    .then((res) => { if (res?.optedOut) setStatus(`رقم …${String(msg.phone).slice(-4)} طلب إيقاف الرسايل واتشال من الإرسال`, 'idle'); })
    .catch(() => {});
});

/** Closing while sending: ask first (Chrome shows its own "Leave?" box). */
window.addEventListener('beforeunload', (e) => {
  if (!running) return;
  e.preventDefault();
  e.returnValue = '';
});
$('unpair').addEventListener('click', async () => {
  if (!confirm('إلغاء ربط الجهاز ده؟ هتحتاجي كود جديد من السيستم.')) return;
  stop();
  await store.clear();
  cfg = null;
  render();
});
// Closing the panel stops sending: hand the number back right away instead of after the lock expires.
window.addEventListener('pagehide', () => {
  if (running && cfg) fetch(`${cfg.server}/api/wa-ext/release`, { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${cfg.token}` } }).catch(() => {});
});

(async () => {
  try {
    const version = chrome.runtime.getManifest().version;
    document.querySelectorAll('.ver').forEach((n) => { n.textContent = `v${version}`; });
  } catch { /* preview */ }
  document.body.classList.toggle('mini', MINI);
  cfg = await store.get();
  if (cfg) $('server').value = cfg.server;
  else void suggestServer();
  render();
  void findWaTab().catch(() => {});
  await refreshState();
  // Carry on sending when the other view just handed over to this one.
  const { [RESUME_KEY]: resumeAt } = await chrome.storage.local.get(RESUME_KEY);
  if (cfg && resumeAt && Date.now() - resumeAt < 20000) {
    await chrome.storage.local.set({ [RESUME_KEY]: 0 });
    start();
  }
  setInterval(() => { void refreshState(); void findWaTab().catch(() => {}); }, 15000);
})();
