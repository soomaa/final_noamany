import {readFileSync} from 'fs';
import {resolve} from 'path';
import {standardExercise} from './standard-exercises';
import {TrainingService} from './training.service';
import {MUSCLES} from './training-domain';
import definitions from './standard-exercise-profiles.json';
function service(profiles: unknown[] = []) {
 const db={club_equipment:{findMany:jest.fn().mockResolvedValue([])},club_exercises:{findMany:jest.fn().mockResolvedValue([{id:1,name:'الرفعة المميتة',instructions:''}])},am_exercises:{findMany:jest.fn().mockResolvedValue([{id:2,name:'دراجة ثابتة',instructions:''}])},training_exercise_profiles:{findMany:jest.fn().mockResolvedValue(profiles),upsert:jest.fn()}};
 return new TrainingService(db as never,{allowedBranchIds:()=>null} as never);
}
describe('Standard exercise muscle targets',()=>{
 it('covers every club and application seed exercise without inventing targets for unknown movements',()=>{
  const files=[['20-club.ts','const exerciseDefs','const exercises:'],['40-accounting-app.ts','const EXERCISES:','for (const ex of EXERCISES)']];
  for(const [file,start,end] of files){const source=readFileSync(resolve('prisma/seed',file),'utf8');const section=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));for(const match of section.matchAll(/name: '([^']+)'/g))expect(standardExercise(match[1]).primary.length).toBeGreaterThan(0);}
  expect(standardExercise('Unknown captain movement').primary).toEqual([]);
 });
 it('returns only valid distinct muscles, classifies cardio/timed tracking, and isolates mutable results',()=>{
  const ids=new Set(MUSCLES.map(m=>m.id));
  const mapped=new Set(['front','back'].flatMap(side=>JSON.parse(readFileSync(resolve('../frontend/public/anatomy',side+'.json'),'utf8')).paths.filter((p:{detail:boolean})=>!p.detail).map((p:{muscle:string})=>p.muscle)));
  for(const id of ids)expect(mapped.has(id)).toBe(true);
  for(const profile of definitions){for(const m of [...profile.primary,...profile.secondary])expect(ids.has(m)).toBe(true);expect(profile.primary.some(m=>profile.secondary.includes(m))).toBe(false);}
  expect(standardExercise('تمرين البلانك').kind).toBe('timed');expect(standardExercise('دراجة ثابتة').kind).toBe('cardio');
  const first=standardExercise('Deadlift');first.primary.length=0;expect(standardExercise('Deadlift').primary.length).toBeGreaterThan(0);
 });
 it('serves default targets to both catalogs and preserves explicit coach overrides',async()=>{
  const catalog=await service().catalog();expect(catalog.exercises.find(e=>e.key==='club:1')?.primary).toEqual(['glutes','hamstrings','lower_back']);expect(catalog.exercises.find(e=>e.key==='app:2')?.kind).toBe('cardio');
  const overrides=[{key:'club:1',name:'الرفعة المميتة',kind:'strength',primary_muscles:['glutes'],secondary_muscles:['abs'],instructions:'Coach protocol',video_url:null}];
  const custom=(await service(overrides).catalog()).exercises.find(e=>e.key==='club:1');expect(custom?.primary).toEqual(['glutes']);expect(custom?.secondary).toEqual(['abs']);expect(custom?.instructions).toBe('Coach protocol');
 });
 it('repairs legacy empty profiles at read time and requires targets on new profile saves',async()=>{
  const empty=[{key:'club:1',name:'الرفعة المميتة',kind:'strength',primary_muscles:[],secondary_muscles:[],instructions:'',video_url:null}];
  expect((await service(empty).catalog()).exercises.find(e=>e.key==='club:1')?.primary.length).toBeGreaterThan(0);
  await expect(service().saveExercise({name:'Custom',kind:'strength',primary:[],secondary:[]},{sub:1} as never)).rejects.toThrow('حدد عضلة أساسية');
 });
});
