import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createFixtureServer } from './local-app-fixture-server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const server = await createFixtureServer(); await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const output = fileURLToPath(new URL('../../outputs/training-workspace-port-20261015/', import.meta.url));
await mkdir(output, { recursive: true });
const errors = [];
const muscleNames = ['chest','shoulders','biceps','triceps','forearms','abs','obliques','quads','adductors','hamstrings','glutes','calves','lats','traps','upper_back','lower_back'];
const muscles = muscleNames.map(id => ({ id, ar: id === 'chest' ? 'الصدر' : id, en: id }));
const member = { id: 9, branchId: 1, memberCode: 'A000009', name: 'عضو التدريب التجريبي', phone: null, isActive: true };
const exercise = { key: 'club:1', name: 'Bench press', kind: 'strength', primary: ['chest'], secondary: ['triceps'], instructions: 'Controlled movement', videoUrl: 'https://example.com/exercise', editable: true, equipmentIds: [], equipment: [] };
const values = {height:175,weight:85,chest:104,waist:91,hips:106,arm:34,thigh:61,calf:39};
try {
  const cases = process.env.TRAINING_ACCESS_ONLY === '1'
    ? [['readonly', {width:1440,height:1050}, 'en'], ['trainer', {width:390,height:844}, 'ar']]
    : [['desktop', {width:1440,height:1050},'ar'], ['mobile', {width:390,height:844},'en']];
  for (const [device, viewport, locale] of cases) {
    const trainer = device === 'trainer', readonly = device === 'readonly';
    const context = await browser.newContext({viewport});
    await context.addInitScript(value => localStorage.setItem('hr_locale',value),locale);
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => { errors.push(error.message); console.log('PAGEERROR',error.message); });
    const label = (ar,en) => locale === 'ar' ? ar : en;
    const plan = { id:31, revision:3, name:'برنامج التدريب التجريبي', weeks:8, status:'published', branch_id:1, created_by:1, goal:'Strength and control', days:[{id:'day-one', name:'1', reportLocale:locale, exercises:[{...exercise, sets:3,reps:10,seconds:0,rest:60,note:'Keep control',phase:'workout'}]}] };
    const journey = {member, assignment:{id:4,plan_revision:3,snapshot:structuredClone(plan),start_date:'2026-10-01'},trainer:{id:7,name:'مدرب تجريبي'}, sessions:[],photos:[],metrics:[],events:[],muscleSets:{},historyLimit:200,nextSessionCursor:null,
      body:{checkins:[{id:'body-one',date:'2026-10-15',measurements:values,note:'Tape method'}],baseline:{id:'body-first',date:'2026-10-01',measurements:{...values,weight:90,waist:96},note:''},target:{revision:1,measurements:{weight:80,waist:85},target_date:'2026-12-01',note:'Target'}}};
    const writes = [];
    await page.route('**/api/**',async route => {
      const request = route.request(); const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return route.fallback();
      const path = url.pathname.slice(4).replace('/trainer-portal/training', '/club-training'); let body = [];
      if (path === '/auth/me') body = {sub:1,id:1,name:'Test Operator',level:trainer ? 2 : 1,branch:1,is_trainer:trainer,trainer_id:trainer ? 7 : null,employeeId:50};
      else if (path === '/me/permissions') body = {superAdmin:!trainer && !readonly,keys:trainer ? ['trainer.portal:view'] : ['club.fitness.programs:view','club.members:view'],routeMap:{'/trainer':'trainer.portal','/club/fitness/programs':'club.fitness.programs'},resourceActions:{'trainer.portal':['view'],'club.fitness.programs':['view','create','update','delete'],'club.members':['view']},scope:{}};
      else if (path === '/me/workspace') body = {homeRoute:trainer ? '/trainer' : '/club/fitness/programs',widgets:[],roleHint:trainer ? 'trainer' : 'admin'};
      else if (path === '/club-training/catalog') body = {muscles,exercises:[{...exercise,editable:!trainer}],equipment:[]};
      else if (path === '/club-training/plans') {
        if (request.method() === 'PUT') { const payload=request.postDataJSON(); writes.push({path,...payload}); Object.assign(plan,payload,{revision:plan.revision+1,branch_id:payload.branchId}); body=plan; }
        else body=[plan];
      } else if (path === '/club-training/members') body=[member];
      else if (path === '/club/search') body={hits:[member],topMatch:member};
      else if (path === '/club-members/9') body=member;
      else if (path === '/club-training/members/9') body=journey;
      else if (path === '/club-training/members/9/sessions' && request.method() === 'POST') { const payload=request.postDataJSON();writes.push({path,...payload});body={...payload,revision:1};journey.sessions.unshift({...body,assignment_id:payload.assignmentId,day_id:payload.dayId,author:'staff:1'}); }
      else if (path === '/club-training/members/9/body/checkins' && request.method() === 'POST') {const payload=request.postDataJSON();writes.push({path,...payload});body=payload;journey.body.checkins.unshift(payload);}
      else if (path === '/club-training/trainers') body=[{id:7,name:'مدرب تجريبي'}];
      else if (path.endsWith('branches') || path.endsWith('branch-options')) body=[{id:1,name:'فرع تجريبي',isActive:true}];
      else if (path.endsWith('/unread-count')) body={count:0};
      else if (path === '/shifts/schedule-status') body={current:null,next:null,secondsUntilNext:null,alertActive:false};
      await route.fulfill({json:body});
    });
    async function capture(name) {
      await page.screenshot({path:`${output}${device}-${name}.png`,fullPage:true,animations:'disabled'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1),false,`${device} ${name} document overflow`);
    }
    await page.goto(`${base}${trainer ? '/trainer/training?member=9&code=A000009' : '/club/fitness/programs'}`);
    await page.getByRole('heading',{name:label('مساحة التدريب','Training workspace'),exact:true}).waitFor();
    const nav = page.getByRole('navigation',{name:label('مساحة التدريب','Training workspace'),exact:true});
    assert.equal(await nav.getByRole('button').count(),4);
    if (readonly || trainer) {
      if (trainer) {
        assert.match(page.url(), /trainer\/training/);
        await page.getByRole('button',{name:'تسجيل حصة',exact:true}).waitFor();
        assert.equal(await page.getByRole('link',{name:'البرامج السابقة',exact:true}).count(),0);
      } else {
        await page.locator('#training-member').fill(member.memberCode);
        await page.getByRole('option',{name:new RegExp(member.name)}).click();
        await page.getByRole('heading',{name:'Performance history',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Record session',exact:true}).count(),0);
      }
      await nav.getByRole('button',{name:label('البرامج','Programs'),exact:true}).click();
      await page.getByRole('heading',{name:plan.name,exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:label('فتح البرنامج','Open program'),exact:true}).count(),0);
      if (readonly) assert.equal(await page.getByRole('button',{name:'Build program',exact:true}).count(),0);
      else {
        await page.getByRole('button',{name:'بناء برنامج',exact:true}).click();
        assert.equal(await page.getByRole('option',{name:'معتمد للنادي',exact:true}).count(),0);
        await page.getByRole('button',{name:'رجوع',exact:true}).click();
      }
      await nav.getByRole('button',{name:label('مكتبة العضلات والتمارين','Exercise & muscle library'),exact:true}).click();
      assert.equal(await page.getByRole('button',{name:label('تعديل التمرين','Edit exercise'),exact:true}).count(),0);
      if (readonly) assert.equal(await page.getByRole('button',{name:'New exercise',exact:true}).count(),0);
      assert.equal(writes.length,0);
      await context.close(); console.log(`PASS ${device}: scoped entry, visible tabs and independent mutation permissions`); continue;
    }

    await nav.getByRole('button',{name:label('مكتبة العضلات والتمارين','Exercise & muscle library'),exact:true}).click();
    await page.getByRole('button',{name:label('عرض التفاصيل والعضلات','View details & muscles'),exact:true}).first().click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('link',{name:label('مشاهدة فيديو الشرح','Watch instruction video')}).waitFor();
    assert.equal(await dialog.getByRole('link').first().getAttribute('href'),'https://example.com/exercise');
    await page.keyboard.press('Escape');
    const map = page.getByRole('img',{name:label('خريطة العضلات المستهدفة','Target muscle map')}).first();
    await map.waitFor();
    const highlighted = await map.locator('path').evaluateAll(paths => paths.some(path => {
      const color=getComputedStyle(path).fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      return color && Number(color[1]) > Number(color[2])*1.5 && Number(color[1]) > Number(color[3])*1.5;
    }));
    assert.equal(highlighted,true,'configured primary muscles must use the visible red targeting color');
    await capture('library');
    await nav.getByRole('button',{name:label('البرامج','Programs'),exact:true}).click();
    await page.getByRole('heading',{name:plan.name,exact:true}).waitFor();
    await capture('programs');
    await page.getByRole('button',{name:label('معاينة ورقة البرنامج','Preview program sheet'),exact:true}).click();
    const sheet=page.locator('dialog[open] iframe').contentFrame();
    await sheet.getByRole('heading',{name:label('خطة التمرين','WORKOUT PLAN'),exact:true}).waitFor();
    assert.equal(await sheet.locator('img').first().getAttribute('src'),'/one-logo.png');
    await page.locator('dialog[open]').getByRole('button',{name:/إغلاق|Close/}).click();
    await page.getByRole('button',{name:label('فتح البرنامج','Open program'),exact:true}).click();
    const saved=page.waitForRequest(request=>request.method()==='PUT'&&new URL(request.url()).pathname==='/api/club-training/plans');
    await page.locator('#plan-goal').fill('Improved control'); await saved;
    await page.getByText(label('تم الحفظ','Saved'),{exact:true}).last().waitFor();
    assert.equal(writes.filter(row=>row.path==='/club-training/plans').length,1);
    assert.equal(journey.assignment.snapshot.goal,'Strength and control','editing templates preserves assigned snapshots');
    await capture('builder');
    await page.getByRole('button',{name:label('رجوع','Back'),exact:true}).click();
    await nav.getByRole('button',{name:label('المتابعة والسجل','History'),exact:true}).click();
    await page.locator('#training-member').fill(member.memberCode);
    await page.getByRole('option',{name:new RegExp(member.name)}).click();
    await page.getByRole('button',{name:label('تسجيل حصة','Record session'),exact:true}).waitFor();
    await capture('history');
    await page.getByRole('button',{name:label('تسجيل حصة','Record session'),exact:true}).click();
    await dialog.getByRole('checkbox').first().check();
    const sessionSaved=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/api/club-training/members/9/sessions');
    await dialog.getByRole('button',{name:label('حفظ الحصة','Save session'),exact:true}).click(); await sessionSaved;
    await dialog.waitFor({state:'hidden'});
    assert.equal(writes.find(row=>row.path.endsWith('/sessions')).entries[0].sets[0].done,true);
    await nav.getByRole('button',{name:label('المقاسات والهدف','Measurements & target'),exact:true}).click();
    await page.getByRole('button',{name:label('تسجيل مقاسات','Record measurements'),exact:true}).waitFor();
    const model=page.locator('iframe[src="/body3d/index.html"]').first().contentFrame();
    await model.locator('canvas').waitFor({timeout:30000});
    await capture('measurements');
    await page.getByRole('button',{name:label('تسجيل مقاسات','Record measurements'),exact:true}).click();
    await page.locator('#body-9-weight').fill('84');
    await capture('measurement-editor');
    await context.close();
    console.log(`PASS ${device}: four tabs, muscle assets, video, branded sheets, autosave, session save and body model`);
  }
  assert.deepEqual(errors,[],'browser errors');
} finally {await browser.close();await server.close();}
