import { registerBrandProfile } from '../../../../ports/brand-registry';
registerBrandProfile({ name: 'Nomany', tagline: '', mark: 'N', logoSrc: '/one-logo.png', opaqueLogoSrc: null });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutSheetHtml } from './workout-sheet-model';
import type { Plan } from './model';
const exercise = {key:'press',name:'Press <test>',kind:'strength' as const,primary:['chest'],secondary:[],instructions:'',videoUrl:null,sets:3,reps:10,seconds:0,rest:60,note:'Control & breathe'};
const plan: Plan = {name:'Strength <script>alert(1)</script>',goal:'Control',weeks:8,status:'draft',days:[{id:'one',name:'Day one',exerciseType:'Strength',warmup:{equipment:'Bike',seconds:300,note:'Build pace'},exercises:[{...exercise,phase:'workout',loadMode:'percent1rm',load:70},{...exercise,rowId:'repeat',phase:'cooldown',load:20,loadMode:'kg'}]},{id:'two',name:'Day two',exercises:[]}]};
test('workout sheet preserves paper fields, phases, prescribed units, and safely escaped coach text', () => {
 const html=workoutSheetHtml(plan,{locale:'en',dayId:'one',memberName:'Member <b>A</b>',trainerName:'Coach',startDate:'2026-10-07'});
 for(const value of ['Client name','Exercise type','Warm-up','Skill development','Cool-down','Fitness manager','70 % 1RM','20 kg','Bike','300','2026-10-07']) assert.ok(html.includes(value),value);
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Control &amp; breathe'));
 assert.equal((html.match(/Press &lt;test&gt;/g)??[]).length,2);assert.ok(!html.includes('Day two'));
});
test('Arabic export uses RTL and retains unassigned trainer/manager spaces without invented approval', () => {
 const html=workoutSheetHtml(plan,{locale:'ar'});
 assert.ok(html.includes('dir="rtl"'));assert.ok(html.includes('مدير اللياقة'));assert.ok(html.includes('________________'));assert.equal((html.match(/class="sheet"/g)??[]).length,2);
});

test('phase columns follow the paper and retain optional prescriptions and full multiline notes', () => {
 const html=workoutSheetHtml({...plan,days:[{id:'one',name:'Full plan',exercises:[{...exercise,phase:'workout',load:20},{...exercise,phase:'skill',seconds:30,note:'First line\nSecond line'},{...exercise,phase:'cooldown',load:5,loadMode:'kg'}]}]},{locale:'en'});
 const sections=html.split('<section class="phase">').slice(1);
 assert.ok(!sections[1].includes('Time / sec'));
 assert.ok(sections[2].includes('Time / sec'));
 assert.ok(!sections[2].includes('Weight / 1RM'));
 assert.ok(sections[3].includes('5 kg'));
 assert.ok(html.includes('First line\nSecond line'));
 assert.ok(html.includes('/one-logo.png'));
});

test('saved section language controls report language independently from admin language', () => {
 const saved={...plan,days:plan.days.map(day=>({...day,reportLocale:'en' as const}))};
 const html=workoutSheetHtml(saved,{locale:'ar',dayId:'one'});
 assert.ok(html.includes('lang="en" dir="ltr"'));assert.ok(html.includes('Client name'));assert.ok(!html.includes('اسم العميل'));
 const arabic=workoutSheetHtml({...saved,days:saved.days.map(day=>({...day,reportLocale:'ar' as const}))},{locale:'en'});
 assert.ok(arabic.includes('lang="ar" dir="rtl"'));assert.ok(arabic.includes('اسم العميل'));
});

test('coach can supply the report movement name while preserving the catalog identity', () => {
 const html=workoutSheetHtml({...plan,days:[{id:'one',name:'Upper',reportLocale:'en',exercises:[{...exercise,reportName:'Dumbbell <press>'}]}]},{locale:'ar'});
 assert.ok(html.includes('Dumbbell &lt;press&gt;'));assert.ok(!html.includes('Press &lt;test&gt;'));
});
