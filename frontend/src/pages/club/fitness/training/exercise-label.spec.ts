import assert from 'node:assert/strict';
import test from 'node:test';
import {exerciseLabel, matchesExercise} from './exercise-label';
import {workoutSheetHtml} from './workout-sheet-model';
import type {Plan, Exercise} from './model';
const exercise: Exercise={key:'club:1',name:'الرفعة المميتة',kind:'strength',primary:['lower_back'],secondary:[],instructions:'',videoUrl:null};
test('standard exercises show English and remain searchable by Arabic or English',()=>{
 assert.equal(exerciseLabel(exercise,'en'),'Deadlift');
 assert.equal(exerciseLabel(exercise,'ar'),'الرفعة المميتة');
 assert.ok(matchesExercise(exercise,'deadlift','en'));
 assert.ok(matchesExercise(exercise,'المميتة','en'));
 assert.equal(exercise.name,'الرفعة المميتة');
 assert.equal(exerciseLabel({...exercise,name:'حركة خاصة بالكابتن'},'en'),'حركة خاصة بالكابتن');
});
test('saved report language localizes standard names and preserves explicit report names',()=>{
 const row={...exercise,sets:3,reps:10,rest:60,seconds:0,note:''};
 const plan:Plan={name:'Demo',goal:'Strength',weeks:8,status:'draft',days:[{id:'1',name:'Day one',reportLocale:'en',exercises:[row]}]};
 assert.match(workoutSheetHtml(plan,{locale:'ar'}),/<td>Deadlift<\/td>/);
 plan.days[0].exercises[0].reportName='Coach-specific movement';
 assert.match(workoutSheetHtml(plan,{locale:'ar'}),/<td>Coach-specific movement<\/td>/);
});
