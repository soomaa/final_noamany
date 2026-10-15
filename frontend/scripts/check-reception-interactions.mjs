import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { createFixtureServer } from './local-app-fixture-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const server = await createFixtureServer(process.env.RECEPTION_STATIC_ROOT);
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], requests = [], writes = [];
page.on('pageerror', error => errors.push(error.message));
const member = { id: 7, memberCode: 'A000007', name: 'Interaction Test Member', branchId: 1,
  phone: null, cardNumber: null, gender: 'male', isActive: true, isBlocked: false,
  matchType: 'code', score: 1000, activeSubscriptionType: null };
const services = Array.from({ length: 40 }, (_, i) => ({ id: i+1, branchId: 1, name: `Test Service ${i+1}`, price: 100+i, isActive: true }));
const subs = Array.from({ length: 20 }, (_, i) => ({ id: i+1, memberId: 7, branchId: 1, subscriptionTypeId: i+1,
  subscriptionType: `Test Package ${i+1}`, subscriptionStartDate: '2020-01-01', subscriptionEndDate: '2099-01-01',
  status: 'active', isLinkedToSessions: false, value: 500, paidAmount: 400, remainingAmount: 100, discountValue: 0,
  paymentMethod: 'cash', isSpecial: false, gender: 'male' }));
const routeMap = Object.fromEntries(Array.from({length:500}, (_,i) => [`/test-route/${i}`, `test-${i}`]));
routeMap['/club/reception'] = 'club.reception';
const measured = [];
try {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.slice(4);
    requests.push(path);
    if (route.request().method() !== 'GET') writes.push(path);
    let body = [];
    if (path === '/auth/me') body = { sub: 1, id: 1, name: 'Test Operator', level: 1, branch: 1 };
    else if (path === '/me/permissions') body = { superAdmin: true, keys: [], routeMap, resourceActions: {}, scope: {} };
    else if (path === '/me/workspace') body = { homeRoute: '/club/reception', widgets: [], roleHint: 'admin' };
    else if (path === '/me/workspace/widgets') body = { config: { widgets: [] }, data: {} };
    else if (path.endsWith('branches') || path.endsWith('branch-options')) body = [{ id: 1, name: 'Test Branch', isActive: true }];
    else if (path === '/club-lockers/handoffs/open') body = { holding: [], availableLockers: [] };
    else if (path === '/club-lockers/desk') body = { lockers: [], current: null };
    else if (path === '/club/search') body = [member];
    else if (path === '/club-members/7') body = member;
    else if (path === '/club/entitlement/validate') body = { allowed: true, member, reasons: [], warnings: [] };
    else if (path === '/club-subscriptions') body = { data: subs, total: subs.length };
    else if (path === '/club-quick-services/catalog') body = services;
    else if (path === '/club-subscription-types') body = Array.from({length:300}, (_,i) => ({ id:i+1, name:`Type ${i+1}`, price:500, isActive:true }));
    else if (path === '/club-invitations/summary') body = { memberId:7, memberName:member.name, remaining:0, subscriptions:[], history:[] };
    else if (path === '/club-attendance') body = { data: Array.from({length:10}, (_,i) => ({ id:i+1,
      memberName:`Attendance ${i+1}`, memberCode:`A${String(i+1).padStart(6,'0')}`, branchId:1,
      attendanceDate:'2026-10-08', checkInTime:'2026-10-08T06:00:00Z', checkOutTime:null, status:'checked_in' })), total:10 };
    else if (path === '/club-attendance/statistics') body = { todayCheckIns:10, todayCheckOuts:0, activeCheckIns:10, totalRecords:10 };
    else if (path.endsWith('/unread-count')) body = { count:0 };
    await route.fulfill({ json: body });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/club/reception`);
  const input = page.getByRole('textbox', {name:'بحث سريع عن العضو',exact:true});
  await input.waitFor();
  await page.waitForTimeout(700);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
  await page.evaluate(() => {
    window.interactionQA = { paints:[], longTasks:[] };
    new PerformanceObserver(list => window.interactionQA.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask'});
    for (const event of ['click','keydown']) document.addEventListener(event, e => {
      if (event === 'keydown' && e.key.length !== 1) return;
      const start=performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => window.interactionQA.paints.push({event,ms:performance.now()-start})));
    }, true);
  });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  async function step(name, action) {
    const start=Date.now();
    await action();
    measured.push({name,ms:Date.now()-start});
  }
  await step('open lockers',async()=>{
    await page.getByRole('button',{name:'لوكرات مع الأعضاء',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button',{name:'إغلاق',exact:true}).last().click();
  });
  await input.fill('7');
  await input.press('Enter');
  await page.getByRole('heading',{name:member.name,exact:true}).waitFor();
  await page.getByText('Test Package 1',{exact:true}).waitFor();
  await page.waitForTimeout(250);
  await step('open block reason',async()=>{
    await page.getByRole('button',{name:'حظر العضو',exact:true}).click();
    await page.getByRole('heading',{name:'حظر العضو',exact:true}).waitFor();
  });
  const reason = page.getByPlaceholder('اكتب سببًا واضحًا يظهر لفريق الاستقبال عند محاولة الدخول...');
  await reason.pressSequentially('سبب تجريبي فقط', {delay:70});
  assert.equal(await reason.inputValue(),'سبب تجريبي فقط');
  await step('close block reason',async()=>{
    await page.getByRole('button',{name:'إغلاق',exact:true}).last().click();
    await reason.waitFor({state:'hidden'});
  });
  await step('open freeze',async()=>{
    await page.getByRole('button',{name:'تجميد',exact:true}).first().click();
    await page.getByRole('dialog').last().waitFor();
  });
  await page.getByRole('dialog').last().getByRole('textbox').pressSequentially('تجميد تجريبي', {delay:70});
  await page.getByRole('button',{name:'إغلاق',exact:true}).last().click();
  await step('close member',async()=>{
    await page.getByRole('button',{name:'إغلاق',exact:true}).last().click();
    await input.waitFor({state:'visible'});
  });
  await page.waitForTimeout(250);
  const {profile} = await cdp.send('Profiler.stop');
  const samples = new Map();
  const names = new Map(profile.nodes.map(n=>[n.id,`${n.callFrame.functionName} ${n.callFrame.url}`]));
  profile.samples.forEach((id,i)=>samples.set(names.get(id),(samples.get(names.get(id))??0)+profile.timeDeltas[i]/1000));
  const report = {cpuThrottle:4, fixture:{subscriptions:20,services:40,routes:500},steps:measured,
    metrics:await page.evaluate(()=>window.interactionQA),requests:requests.reduce((a,p)=>(a[p]=(a[p]??0)+1,a),{}),
    hotFunctionsMs:[...samples].sort((a,b)=>b[1]-a[1]).slice(0,22),errors,writes};
  const output=fileURLToPath(new URL('../../outputs/reception-interactions-20261008/',import.meta.url));
  await mkdir(output,{recursive:true});
  await writeFile(`${output}${process.env.RECEPTION_PROFILE||'current'}.json`,JSON.stringify(report,null,2));
  if (process.env.RECEPTION_REVIEW) {
    for (const [device, width, height] of [['desktop',1440,1000],['mobile',390,844]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(250);
      await page.screenshot({path:`${output}${device}-reception.png`,fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1), `${device}: reception must fit the viewport`);
      await input.fill('7');
      await input.press('Enter');
      await page.getByRole('heading',{name:member.name,exact:true}).waitFor();
      await page.waitForTimeout(250);
      await page.screenshot({path:`${output}${device}-member.png`,fullPage:true});
      await page.getByRole('button',{name:'إغلاق',exact:true}).last().click();
      await input.waitFor({state:'visible'});
    }
  }
  console.log(JSON.stringify(report,null,2));
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[],'interaction profiling must not mutate business data');
} finally { await browser.close(); await server.close(); }
