import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanAutosave, readyToSave, type SaveState} from './plan-autosave';
import type {Plan} from './model';
const plan:Plan={id:1,revision:3,name:'Plan',goal:'',weeks:8,status:'draft',branch_id:10,days:[{id:'stable',name:'1',reportLocale:'en',exercises:[{key:'club:1',name:'Press',kind:'strength',primary:['chest'],secondary:[],instructions:'',videoUrl:null,sets:3,reps:10,seconds:0,rest:60,note:''}]}]};
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve};};
test('serial saves keep edits made during a request and advance revision without overwriting the draft',async()=>{
 const first=deferred<Plan>();const requests:Plan[]=[];const states:SaveState[]=[];
 const saver=createPlanAutosave(plan, async payload=>{requests.push(payload);return requests.length===1?first.promise:{...payload,revision:5};},state=>states.push(state),()=>{});
 saver.update({...plan,name:'First edit'});const pending=saver.flush();
 saver.update({...plan,name:'Latest edit'});assert.equal(saver.flush(),pending);assert.equal(requests.length,1);
 first.resolve({...plan,revision:4});assert.equal(await pending,true);
 assert.equal(requests.length,2);assert.equal(requests[1].name,'Latest edit');assert.equal(requests[1].revision,4);assert.equal(requests[1].days[0].name,'Day 1');
 assert.equal(saver.dirty(),false);assert.equal(states.at(-1),'saved');
});
test('new plans create once then reuse their ID for queued changes',async()=>{
 const first=deferred<Plan>();const requests:Plan[]=[];const fresh={...plan,id:undefined,revision:undefined};
 const saver=createPlanAutosave(fresh,async payload=>{requests.push(payload);return requests.length===1?first.promise:{...payload,id:8,revision:2};},()=>{},()=>{});
 saver.update({...fresh,name:'New'});const pending=saver.flush();saver.update({...fresh,name:'Newest'});
 first.resolve({...fresh,id:8,revision:1});await pending;
 assert.equal(requests[0].id,undefined);assert.equal(requests[1].id,8);assert.equal(requests[1].revision,1);
});
test('incomplete data stays pending locally and never sends an invalid plan',async()=>{
 let calls=0;const saver=createPlanAutosave(plan,async()=>{calls++;return plan;},()=>{},()=>{});
 saver.update({...plan,days:[{...plan.days[0],name:''}]});assert.equal(await saver.flush(),false);assert.equal(calls,0);assert.equal(saver.state(),'waiting');
 assert.equal(readyToSave({...plan,days:[{...plan.days[0],exercises:[]}]}),false);
});
test('revision conflicts stop writes and preserve newer edits',async()=>{
 let calls=0;const saver=createPlanAutosave(plan,async()=>{calls++;throw {response:{status:409}};},()=>{},()=>{});
 saver.update({...plan,name:'Mine'});assert.equal(await saver.flush(),false);assert.equal(saver.state(),'conflict');
 saver.update({...plan,name:'Mine again'});await saver.flush();assert.equal(calls,1);assert.equal(saver.dirty(),true);
});
test('failed updates can retry but an unconfirmed creation never automatically creates a duplicate',async()=>{
 let calls=0;const saver=createPlanAutosave(plan,async payload=>{if(++calls===1)throw new Error('offline');return {...payload,revision:4};},()=>{},()=>{});
 saver.update({...plan,name:'Changed'});await saver.flush();assert.equal(saver.state(),'error');assert.equal(await saver.flush(),true);
 let creates=0;const fresh={...plan,id:undefined,revision:undefined};const creator=createPlanAutosave(fresh,async()=>{creates++;throw new Error('connection lost');},()=>{},()=>{});
 creator.update({...fresh,name:'New'});await creator.flush();creator.update({...fresh,name:'Changed'});await creator.flush();assert.equal(creates,1);assert.equal(creator.state(),'unconfirmed');
});
test('restored drafts sync without needing another edit',async()=>{
 let calls=0;const saver=createPlanAutosave(plan,async payload=>{calls++;return {...payload,revision:4};},()=>{},()=>{},true);
 saver.update(plan);await saver.flush();assert.equal(calls,1);assert.equal(saver.dirty(),false);
});

test('an unconfirmed creation stays blocked after restoring its local draft',async()=>{
 let calls=0;const saver=createPlanAutosave({...plan,id:undefined,revision:undefined},async()=>{calls++;return plan;},()=>{},()=>{},true,true);
 saver.update({...plan,id:undefined,revision:undefined,name:'Restored'});assert.equal(await saver.flush(),false);assert.equal(calls,0);assert.equal(saver.state(),'unconfirmed');
});
