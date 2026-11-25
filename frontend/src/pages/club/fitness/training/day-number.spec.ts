import assert from 'node:assert/strict';
import test from 'node:test';
import {numericDayInput, savedDayNumber, dayLabel, nextDayNumber, validDayNumber, validPlanDayNumbers} from './day-number';
import {workoutSheetHtml} from './workout-sheet-model';
test('day input accepts only digits, supports Arabic numerals, and allows clearing while editing',()=>{
 assert.equal(numericDayInput('12'),'12');assert.equal(numericDayInput('١٢'),'12');assert.equal(numericDayInput('۱۲'),'12');assert.equal(numericDayInput(''),'');
 for(const invalid of ['Day 1','1.5','-1','+1','1e2','1abc']) assert.equal(numericDayInput(invalid),null);
 for(const invalid of ['','0','000','1.5','999999999999999999999']) assert.equal(validDayNumber(invalid),false);
});
test('numbers display in the selected language, preserve legacy names, and retain stable day identity',()=>{
 assert.equal(dayLabel({name:'7'},'en'),'Day 7');assert.equal(dayLabel({name:'Day 7'},'ar'),'اليوم ٧');assert.equal(dayLabel({name:'اليوم ٧'},'en'),'Day 7');
 assert.equal(savedDayNumber('Day 02'),'2');assert.equal(dayLabel({name:'Upper body'},'en'),'Upper body');
 assert.equal(nextDayNumber([{name:'1'},{name:'3'}]),'2');
 assert.equal(validPlanDayNumbers([{name:'1'},{name:'01'}]),false);assert.equal(validPlanDayNumbers([{name:'1'},{name:'2'}]),true);
 const html=workoutSheetHtml({name:'Plan',goal:'',weeks:8,status:'draft',days:[{id:'stable-id',name:'3',reportLocale:'en',exercises:[]}]},{locale:'ar'});
 assert.ok(html.includes('Day 3'));
});
